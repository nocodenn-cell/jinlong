-- Reconciliação do CONTRATO DO CAIXA (C3) — investigação, NÃO ligado ao CI.
--
-- Compara, por cenário, as leituras de "dinheiro na gaveta":
--   saldo_atual  = contador por UPDATE direto (7 escritores) — só compatibilidade/cache (D-1)
--   sistema      = public.calcular_valor_sistema_dinheiro_caixa — AUTORIDADE (D-1)
--   esperado     = efeito FÍSICO segundo docs/contratos/CONTRATO_CAIXA_C3.md
--
-- Blocos:
--   A. caixa da venda ABERTO           (S1–S7)   -> contrato já cumprido hoje
--   B. caixa da venda FECHADO          (S8, S9)  -> D-2: impacto no caixa que desembolsa; fechado imutável
--   C. VÁRIOS caixas abertos (D-3)     (S10–S13) -> 0/1/N elegíveis; N>1 exige caixa_id explícito
-- Cada loja de teste isola a contagem de "caixas abertos elegíveis".
--
-- Termina com relatório e falha se algo divergir do contrato. Falhas em B e C são ESPERADAS até o PR-2 e
-- formam o mapa do que precisa mudar. Cenários que dependem de parâmetro `p_caixa_id` ainda inexistente
-- são reportados como "API_AUSENTE". Dados sintéticos, tudo em transação com ROLLBACK.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/caixa-reconciliacao-contrato.test.sql

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE recon (
  ord serial, cenario text, saldo numeric(10,2), sistema numeric(10,2), esperado numeric(10,2)
) ON COMMIT DROP;

CREATE TEMP TABLE recon_regra (
  ord serial, cenario text, ok boolean, obs text
) ON COMMIT DROP;

-- ── identidades determinísticas ─────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.lid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f6000001-0000-4000-8000-00000000000' || l)::uuid $$;
CREATE FUNCTION pg_temp.gid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f6000006-0000-4000-8000-00000000000' || l)::uuid $$;
CREATE FUNCTION pg_temp.pid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f6000004-0000-4000-8000-00000000000' || l)::uuid $$;
CREATE FUNCTION pg_temp.cid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f6000005-0000-4000-8000-00000000000' || l)::uuid $$;
CREATE FUNCTION pg_temp.op(n int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f6000002-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
-- loja do operador n: 1–7 -> L1 ; 8–9 -> L2 ; 10–11 -> L3 ; 12–14 -> L4
CREATE FUNCTION pg_temp.lop(n int) RETURNS int LANGUAGE sql AS
$$ SELECT CASE WHEN n <= 7 THEN 1 WHEN n <= 9 THEN 2 WHEN n <= 11 THEN 3 ELSE 4 END $$;

DO $setup$
DECLARE
  l int; n int; v_cat uuid := 'f6000003-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO public.categorias (id, nome) VALUES (v_cat, 'Recon Cat') ON CONFLICT (id) DO NOTHING;
  FOR l IN 1..4 LOOP
    INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (pg_temp.lid(l), 'Recon Loja ' || l, 'RECONC3' || l, true)
    ON CONFLICT (id) DO UPDATE SET ativo = true;

    INSERT INTO auth.users (id) VALUES (pg_temp.gid(l)) ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES (pg_temp.gid(l), 'Recon Gerente ' || l, 'GERENTE', true, pg_temp.lid(l))
    ON CONFLICT (id) DO UPDATE SET perfil = 'GERENTE', ativo = true, loja_id = pg_temp.lid(l);

    INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
    VALUES (pg_temp.pid(l), '789999996' || l || '010', 'Recon Produto ' || l, v_cat, 50.00, 'brasil_nf', false, true, pg_temp.lid(l))
    ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = pg_temp.lid(l), preco_varejo = 50.00;
    INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES (pg_temp.pid(l), pg_temp.lid(l), 1000, 0)
    ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 1000;
    INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo) VALUES
      (pg_temp.lid(l), 'DINHEIRO', 'Dinheiro', true), (pg_temp.lid(l), 'PIX', 'Pix', true)
    ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;
    INSERT INTO public.clientes (id, nome, loja_id, limite_credito) VALUES (pg_temp.cid(l), 'Recon Cliente ' || l, pg_temp.lid(l), 1000)
    ON CONFLICT (id) DO UPDATE SET loja_id = pg_temp.lid(l), limite_credito = 1000;
  END LOOP;

  FOR n IN 1..14 LOOP
    INSERT INTO auth.users (id) VALUES (pg_temp.op(n)) ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES (pg_temp.op(n), 'Recon Op ' || n, 'OPERADOR', true, pg_temp.lid(pg_temp.lop(n)))
    ON CONFLICT (id) DO UPDATE SET perfil = 'OPERADOR', ativo = true, loja_id = pg_temp.lid(pg_temp.lop(n));
    DELETE FROM public.caixas WHERE operador_id = pg_temp.op(n);
  END LOOP;
END
$setup$;

-- ── helpers de operação ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.abrir(n int, fundo numeric) RETURNS uuid LANGUAGE plpgsql AS
$$
DECLARE v uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(n)::text, true);
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
  VALUES (pg_temp.op(n), 'ABERTO', now(), fundo, pg_temp.lid(pg_temp.lop(n))) RETURNING id INTO v;
  RETURN v;
END
$$;

CREATE FUNCTION pg_temp.fechar(n int, contado numeric) RETURNS void LANGUAGE plpgsql AS
$$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(n)::text, true);
  PERFORM * FROM public.fechar_caixa_atomico(pg_temp.op(n), contado, 'recon');
END
$$;

-- Venda: item de R$ 50 (preço do produto), quantidade = total/50.
CREATE FUNCTION pg_temp.vender(n int, p_caixa uuid, p_total numeric, p_pag jsonb, p_cliente uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS
$$
DECLARE v_id uuid := gen_random_uuid(); r record; l int := pg_temp.lop(n);
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(n)::text, true);
  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    v_id, p_caixa, pg_temp.op(n), pg_temp.lid(l), (p_pag->0->>'forma_pagamento'), p_total, 0, p_total, p_pag,
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', pg_temp.pid(l), 'quantidade', p_total / 50,
      'preco_original', 50, 'preco_unitario', 50, 'tipo_preco', 'VAREJO')),
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, p_cliente);
  IF r.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'RECON_SETUP_FALHOU: venda nao concluiu (% / %)', r.status, r.mensagem;
  END IF;
  RETURN v_id;
END
$$;

CREATE FUNCTION pg_temp.din(p numeric) RETURNS jsonb LANGUAGE sql AS
$$ SELECT jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', p)) $$;

CREATE FUNCTION pg_temp.tem_param(p_func text, p_param text) RETURNS boolean LANGUAGE sql AS
$$ SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = p_func AND p_param = ANY (proargnames)) $$;

CREATE FUNCTION pg_temp.medir(p_cenario text, p_caixa uuid, p_esperado numeric) RETURNS void LANGUAGE sql AS
$$
  INSERT INTO recon (cenario, saldo, sistema, esperado)
  SELECT p_cenario, c.saldo_atual, public.calcular_valor_sistema_dinheiro_caixa(c.id), p_esperado
  FROM public.caixas c WHERE c.id = p_caixa
$$;

CREATE FUNCTION pg_temp.regra(p_cenario text, p_ok boolean, p_obs text) RETURNS void LANGUAGE sql AS
$$ INSERT INTO recon_regra (cenario, ok, obs) VALUES (p_cenario, p_ok, p_obs) $$;

-- Devolução como GERENTE da loja. p_caixa NULL = não informar.
-- Retorna o SQLERRM se rejeitada, NULL se aceita; 'API_AUSENTE' se pedir caixa e o parâmetro não existir.
CREATE FUNCTION pg_temp.devolver(p_loja int, p_venda uuid, p_valor numeric, p_key text, p_caixa uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS
$$
DECLARE v_item uuid; v_sql text;
BEGIN
  IF p_caixa IS NOT NULL AND NOT pg_temp.tem_param('devolver_ou_trocar_venda', 'p_caixa_id') THEN
    RETURN 'API_AUSENTE';
  END IF;
  SELECT id INTO v_item FROM public.itens_venda WHERE venda_id = p_venda LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', pg_temp.gid(p_loja)::text, true);
  v_sql := format(
    'SELECT * FROM public.devolver_ou_trocar_venda(%L::uuid, %L, %L, %L, %L::jsonb, %s, %L, NULL::uuid, %L::uuid%s)',
    p_venda, p_key, 'recon', 'DEVOLUCAO',
    jsonb_build_array(jsonb_build_object('item_venda_id', v_item, 'quantidade', 1))::text,
    p_valor, 'DINHEIRO', pg_temp.gid(p_loja),
    CASE WHEN p_caixa IS NULL THEN '' ELSE format(', p_caixa_id => %L::uuid', p_caixa) END);
  BEGIN
    EXECUTE v_sql;
    RETURN NULL;
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
  END;
END
$$;

CREATE FUNCTION pg_temp.cancelar(p_loja int, p_venda uuid, p_caixa uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS
$$
DECLARE v_sql text;
BEGIN
  IF p_caixa IS NOT NULL AND NOT pg_temp.tem_param('cancelar_venda_transacional', 'p_caixa_id') THEN
    RETURN 'API_AUSENTE';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', pg_temp.gid(p_loja)::text, true);
  v_sql := format('SELECT * FROM public.cancelar_venda_transacional(%L::uuid, %L%s)', p_venda, 'recon cancelamento',
    CASE WHEN p_caixa IS NULL THEN '' ELSE format(', p_caixa_id => %L::uuid', p_caixa) END);
  BEGIN
    EXECUTE v_sql;
    RETURN NULL;
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
  END;
END
$$;

-- ═════════════ A. Caixa da venda ABERTO ═════════════
DO $bloco_a$
DECLARE v_cx uuid; v_v uuid; v_t uuid := gen_random_uuid(); v_err text;
BEGIN
  v_cx := pg_temp.abrir(1, 50);
  PERFORM pg_temp.vender(1, v_cx, 100, pg_temp.din(100));
  PERFORM pg_temp.medir('S1 venda integral dinheiro (fundo 50 + 100)', v_cx, 150);

  v_cx := pg_temp.abrir(2, 0);
  PERFORM pg_temp.vender(2, v_cx, 100, jsonb_build_array(
    jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 60), jsonb_build_object('forma_pagamento', 'PIX', 'valor', 40)));
  PERFORM pg_temp.medir('S2 dividida 60 dinheiro + 40 PIX', v_cx, 60);

  v_cx := pg_temp.abrir(3, 0);
  PERFORM pg_temp.vender(3, v_cx, 100, pg_temp.din(60), pg_temp.cid(1));
  PERFORM pg_temp.medir('S3 parcial 60 pago + 40 a receber (valor não recebido não entra)', v_cx, 60);

  v_cx := pg_temp.abrir(4, 0);
  PERFORM pg_temp.vender(4, v_cx, 100, pg_temp.din(100));
  PERFORM public.registrar_movimentacao(v_cx, 'sangria', 'dinheiro', 30, 'recon', 'RETIRADA', NULL, NULL, gen_random_uuid()::text);
  PERFORM public.registrar_movimentacao(v_cx, 'suprimento', 'dinheiro', 10, 'recon', 'TROCO', NULL, NULL, gen_random_uuid()::text);
  PERFORM pg_temp.medir('S4 venda 100, sangria 30, suprimento 10', v_cx, 80);

  v_cx := pg_temp.abrir(5, 0);
  INSERT INTO public.contas_receber (id, cliente_id, valor_total, valor_aberto, loja_id, vencimento, descricao)
  VALUES (v_t, pg_temp.cid(1), 50, 50, pg_temp.lid(1), current_date + 30, 'recon');
  PERFORM set_config('request.jwt.claim.sub', pg_temp.gid(1)::text, true);
  PERFORM * FROM public.registrar_liquidacao_receber(v_t, 50, 'DINHEIRO', NULL, 'recon-ar', v_cx, 'RECON');
  PERFORM pg_temp.medir('S5 recebimento de título 50 em dinheiro', v_cx, 50);

  v_cx := pg_temp.abrir(6, 0);
  v_v := pg_temp.vender(6, v_cx, 100, pg_temp.din(100));
  v_err := pg_temp.cancelar(1, v_v);
  PERFORM pg_temp.medir('S6 venda 100 cancelada no mesmo caixa aberto', v_cx, 0);

  v_cx := pg_temp.abrir(7, 0);
  v_v := pg_temp.vender(7, v_cx, 100, pg_temp.din(100));
  -- Há vários caixas abertos na loja (D-3): a devolução exige caixa_id explícito, senão é rejeitada.
  v_err := pg_temp.devolver(1, v_v, 50, 'recon-dev-7', v_cx);
  IF v_err IS NOT NULL THEN RAISE EXCEPTION 'S7 devolução rejeitada: %', v_err; END IF;
  PERFORM pg_temp.medir('S7 devolução 50 dinheiro, caixa da venda aberto', v_cx, 50);
END
$bloco_a$;

-- ═════════════ B. Caixa da venda FECHADO (D-2: caixa que desembolsa recebe o impacto; fechado imutável) ═════════════
DO $bloco_b$
DECLARE a uuid; b uuid; v uuid; e text;
BEGIN
  -- S8: L2 tem exatamente UM caixa aberto elegível (B) => seleção automática permitida (D-3).
  a := pg_temp.abrir(8, 0);
  v := pg_temp.vender(8, a, 100, pg_temp.din(100));
  PERFORM pg_temp.fechar(8, 100);
  b := pg_temp.abrir(9, 100);
  e := pg_temp.devolver(2, v, 50, 'recon-dev-8');
  PERFORM pg_temp.medir('S8a devolução de venda de caixa FECHADO -> caixa A (fechado): imutável', a, 100);
  PERFORM pg_temp.medir('S8b devolução de venda de caixa FECHADO -> caixa B (único aberto, paga)', b, 50);

  -- S9: cancelamento de venda de caixa fechado, L3 com um único aberto.
  a := pg_temp.abrir(10, 0);
  v := pg_temp.vender(10, a, 100, pg_temp.din(100));
  PERFORM pg_temp.fechar(10, 100);
  b := pg_temp.abrir(11, 100);
  e := pg_temp.cancelar(3, v);
  PERFORM pg_temp.medir('S9a cancelamento de venda de caixa FECHADO -> caixa C (fechado): imutável', a, 100);
  PERFORM pg_temp.medir('S9b cancelamento de venda de caixa FECHADO -> caixa D (único aberto, paga)', b, 0);
END
$bloco_b$;

-- ═════════════ C. Vários caixas abertos (D-3) — L4: A fechado (origem), B e C abertos ═════════════
DO $bloco_c$
DECLARE a uuid; b uuid; c uuid; v uuid; v2 uuid; v3 uuid; e text;
BEGIN
  a := pg_temp.abrir(12, 0);
  v := pg_temp.vender(12, a, 100, pg_temp.din(100));
  v2 := pg_temp.vender(12, a, 100, pg_temp.din(100));
  v3 := pg_temp.vender(12, a, 100, pg_temp.din(100));
  PERFORM pg_temp.fechar(12, 300);
  b := pg_temp.abrir(13, 100);
  c := pg_temp.abrir(14, 100);

  -- S10: mais de um elegível e SEM caixa_id => rejeitar; nada muda (nunca escolher primeiro/último/recente).
  e := pg_temp.devolver(4, v, 50, 'recon-dev-10');
  PERFORM pg_temp.regra('S10 devolução com 2 caixas abertos e sem caixa_id deve ser REJEITADA',
                        e IS NOT NULL, coalesce('rejeitada: ' || e, 'ACEITA (escolheu/ignorou caixa sem pedir)'));
  PERFORM pg_temp.medir('S10a nada muda no caixa B após a tentativa sem caixa_id', b, 100);
  PERFORM pg_temp.medir('S10b nada muda no caixa C após a tentativa sem caixa_id', c, 100);

  -- S11: caixa_id explícito => impacto só no caixa informado (C), B intacto, A intacto.
  e := pg_temp.devolver(4, v, 50, 'recon-dev-11', c);
  PERFORM pg_temp.regra('S11 devolução com caixa_id explícito deve ser ACEITA', e IS NULL, coalesce(e, 'aceita'));
  PERFORM pg_temp.medir('S11a devolução com caixa_id=C -> caixa C paga', c, 50);
  PERFORM pg_temp.medir('S11b devolução com caixa_id=C -> caixa B intacto', b, 100);
  PERFORM pg_temp.medir('S11c devolução com caixa_id=C -> caixa A (fechado) intacto', a, 300);

  -- S12: cancelamento com 2 abertos e sem caixa_id => rejeitar.
  e := pg_temp.cancelar(4, v2);
  PERFORM pg_temp.regra('S12 cancelamento com 2 caixas abertos e sem caixa_id deve ser REJEITADO',
                        e IS NOT NULL, coalesce('rejeitado: ' || e, 'ACEITO'));

  -- S13: nenhum caixa aberto elegível => rejeitar (não há gaveta que pague).
  PERFORM pg_temp.fechar(13, 100);
  PERFORM pg_temp.fechar(14, 50);
  e := pg_temp.devolver(4, v3, 50, 'recon-dev-13');
  PERFORM pg_temp.regra('S13 devolução com NENHUM caixa aberto deve ser REJEITADA por falta de caixa',
                        e IS NOT NULL AND e ILIKE '%CAIXA%',
                        coalesce('rejeitada: ' || e, 'ACEITA (registrou devolução sem gaveta)'));
END
$bloco_c$;

-- ═════════════ Relatório ═════════════
DO $relatorio$
DECLARE r record; v_div int := 0; v_ver text;
BEGIN
  RAISE NOTICE E'\n% | saldo_atual | sistema | esperado | veredito', rpad('cenario (valores)', 84);
  FOR r IN SELECT * FROM recon ORDER BY ord LOOP
    v_ver := CASE
      WHEN r.saldo = r.esperado AND r.sistema = r.esperado THEN 'OK'
      WHEN r.saldo <> r.esperado AND r.sistema <> r.esperado THEN 'AMBOS DIVERGEM'
      WHEN r.saldo <> r.esperado THEN 'saldo_atual diverge (cache)'
      ELSE 'SISTEMA (autoridade) diverge' END;
    RAISE NOTICE '% | % | % | % | %', rpad(r.cenario, 84), r.saldo, r.sistema, r.esperado, v_ver;
    -- D-1: a autoridade é o cálculo; divergência só do cache é sinalizada, mas não reprova.
    IF r.sistema <> r.esperado THEN v_div := v_div + 1; END IF;
  END LOOP;

  RAISE NOTICE E'\n% | veredito', rpad('cenario (regras)', 84);
  FOR r IN SELECT * FROM recon_regra ORDER BY ord LOOP
    RAISE NOTICE '% | % (%)', rpad(r.cenario, 84), CASE WHEN r.ok THEN 'OK' ELSE 'DIVERGE' END, r.obs;
    IF NOT r.ok THEN v_div := v_div + 1; END IF;
  END LOOP;

  IF v_div > 0 THEN
    RAISE EXCEPTION 'caixa-reconciliacao-contrato: % item(ns) divergem do contrato (autoridade = calcular_valor_sistema_dinheiro_caixa)', v_div;
  END IF;
  RAISE NOTICE 'caixa-reconciliacao-contrato OK';
END
$relatorio$;

ROLLBACK;
