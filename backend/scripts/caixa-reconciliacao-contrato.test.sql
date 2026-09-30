-- Reconciliação do CONTRATO DO CAIXA (C3) — investigação, NÃO ligado ao CI.
--
-- Compara, por cenário, as três leituras de "dinheiro na gaveta":
--   saldo_atual  = contador mantido por UPDATE direto (7 escritores)
--   sistema      = public.calcular_valor_sistema_dinheiro_caixa (base do fechamento/comprovante)
--   esperado     = efeito FÍSICO segundo o contrato proposto em docs/contratos/CONTRATO_CAIXA_C3.md
--
-- Termina com relatório e falha se qualquer linha divergir do contrato. Enquanto o PR-2 não implementar o
-- contrato, este teste FALHA de propósito nos cenários S8/S9 (operação em caixa já fechado) — é o mapa do que
-- precisa mudar. Dados sintéticos, tudo em transação com ROLLBACK.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/caixa-reconciliacao-contrato.test.sql

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE recon (
  ord serial,
  cenario text,
  saldo numeric(10,2),
  sistema numeric(10,2),
  esperado numeric(10,2),
  obs text
) ON COMMIT DROP;

-- Setup: loja, gerente, N operadores, produto, estoque, formas de pagamento, cliente.
DO $setup$
DECLARE
  v_loja uuid := 'f6000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'f6000002-0000-4000-8000-000000000000';
  v_cat uuid := 'f6000003-0000-4000-8000-000000000001';
  v_prod uuid := 'f6000004-0000-4000-8000-000000000001';
  v_cli uuid := 'f6000005-0000-4000-8000-000000000001';
  i int;
  v_op uuid;
BEGIN
  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja, 'Recon Loja', 'RECONC3', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES (v_gerente, 'Recon Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = 'GERENTE', ativo = true, loja_id = v_loja;

  FOR i IN 1..12 LOOP
    v_op := ('f6000002-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    INSERT INTO auth.users (id) VALUES (v_op) ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES (v_op, 'Recon Op ' || i, 'OPERADOR', true, v_loja)
    ON CONFLICT (id) DO UPDATE SET perfil = 'OPERADOR', ativo = true, loja_id = v_loja;
    DELETE FROM public.caixas WHERE operador_id = v_op;
  END LOOP;

  INSERT INTO public.categorias (id, nome) VALUES (v_cat, 'Recon Cat') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
  VALUES (v_prod, '7899999960010', 'Recon Produto', v_cat, 50.00, 'brasil_nf', false, true, v_loja)
  ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = v_loja, preco_varejo = 50.00;
  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES (v_prod, v_loja, 1000, 0)
  ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 1000;

  INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo) VALUES
    (v_loja, 'DINHEIRO', 'Dinheiro', true), (v_loja, 'PIX', 'Pix', true)
  ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;

  INSERT INTO public.clientes (id, nome, loja_id, limite_credito) VALUES (v_cli, 'Recon Cliente', v_loja, 1000)
  ON CONFLICT (id) DO UPDATE SET loja_id = v_loja, limite_credito = 1000;
END
$setup$;

-- Helpers (temporários, só desta sessão).
CREATE FUNCTION pg_temp.op(n int) RETURNS uuid LANGUAGE sql AS
$$ SELECT ('f6000002-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;

CREATE FUNCTION pg_temp.abrir(n int, fundo numeric) RETURNS uuid LANGUAGE plpgsql AS
$$
DECLARE v uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(n)::text, true);
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
  VALUES (pg_temp.op(n), 'ABERTO', now(), fundo, 'f6000001-0000-4000-8000-000000000001')
  RETURNING id INTO v;
  RETURN v;
END
$$;

-- Venda: item de R$ 50 (preço do produto), quantidade = total/50; p_pag = pagamentos pagos (jsonb); saldo (total - pago) exige cliente.
CREATE FUNCTION pg_temp.vender(n int, p_caixa uuid, p_total numeric, p_pag jsonb, p_cliente uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS
$$
DECLARE
  v_id uuid := gen_random_uuid();
  r record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(n)::text, true);
  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    v_id, p_caixa, pg_temp.op(n), 'f6000001-0000-4000-8000-000000000001',
    (p_pag->0->>'forma_pagamento'), p_total, 0, p_total, p_pag,
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', 'f6000004-0000-4000-8000-000000000001', 'quantidade', p_total / 50,
      'preco_original', 50, 'preco_unitario', 50, 'tipo_preco', 'VAREJO')),
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, p_cliente
  );
  IF r.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'RECON_SETUP_FALHOU: venda nao concluiu (% / %)', r.status, r.mensagem;
  END IF;
  RETURN v_id;
END
$$;

CREATE FUNCTION pg_temp.medir(p_cenario text, p_caixa uuid, p_esperado numeric, p_obs text DEFAULT NULL)
RETURNS void LANGUAGE sql AS
$$
  INSERT INTO recon (cenario, saldo, sistema, esperado, obs)
  SELECT p_cenario, c.saldo_atual, public.calcular_valor_sistema_dinheiro_caixa(c.id), p_esperado, p_obs
  FROM public.caixas c WHERE c.id = p_caixa
$$;

CREATE FUNCTION pg_temp.din(p numeric) RETURNS jsonb LANGUAGE sql AS
$$ SELECT jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', p)) $$;

-- ═════════════ Cenários com caixa ABERTO (contrato: as duas leituras = esperado) ═════════════
DO $cenarios_abertos$
DECLARE
  v_cx uuid; v_v uuid; v_cli uuid := 'f6000005-0000-4000-8000-000000000001';
  v_titulo uuid := gen_random_uuid(); v_g uuid := 'f6000002-0000-4000-8000-000000000000';
BEGIN
  -- S1 venda integral em dinheiro
  v_cx := pg_temp.abrir(1, 50);
  PERFORM pg_temp.vender(1, v_cx, 100, pg_temp.din(100));
  PERFORM pg_temp.medir('S1 venda integral dinheiro (fundo 50 + 100)', v_cx, 150);

  -- S2 venda dividida: 60 dinheiro + 40 PIX -> só 60 entra na gaveta
  v_cx := pg_temp.abrir(2, 0);
  PERFORM pg_temp.vender(2, v_cx, 100, jsonb_build_array(
    jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 60),
    jsonb_build_object('forma_pagamento', 'PIX', 'valor', 40)));
  PERFORM pg_temp.medir('S2 dividida 60 dinheiro + 40 PIX', v_cx, 60);

  -- S3 parcial: 60 dinheiro + 40 a receber -> valor não recebido NÃO entra no caixa
  v_cx := pg_temp.abrir(3, 0);
  PERFORM pg_temp.vender(3, v_cx, 100, pg_temp.din(60), v_cli);
  PERFORM pg_temp.medir('S3 parcial 60 pago + 40 a receber', v_cx, 60);

  -- S4 sangria e suprimento
  v_cx := pg_temp.abrir(4, 0);
  PERFORM pg_temp.vender(4, v_cx, 100, pg_temp.din(100));
  PERFORM public.registrar_movimentacao(v_cx, 'sangria', 'dinheiro', 30, 'recon', 'RETIRADA', NULL, NULL, gen_random_uuid()::text);
  PERFORM public.registrar_movimentacao(v_cx, 'suprimento', 'dinheiro', 10, 'recon', 'TROCO', NULL, NULL, gen_random_uuid()::text);
  PERFORM pg_temp.medir('S4 venda 100, sangria 30, suprimento 10', v_cx, 80);

  -- S5 recebimento de título em dinheiro
  v_cx := pg_temp.abrir(5, 0);
  INSERT INTO public.contas_receber (id, cliente_id, valor_total, valor_aberto, loja_id, vencimento, descricao)
  VALUES (v_titulo, v_cli, 50, 50, 'f6000001-0000-4000-8000-000000000001', current_date + 30, 'recon');
  PERFORM set_config('request.jwt.claim.sub', v_g::text, true);
  PERFORM * FROM public.registrar_liquidacao_receber(v_titulo, 50, 'DINHEIRO', NULL, 'recon-ar', v_cx, 'RECON');
  PERFORM pg_temp.medir('S5 recebimento de titulo 50 em dinheiro', v_cx, 50);

  -- S6 cancelamento de venda do próprio caixa aberto
  v_cx := pg_temp.abrir(6, 0);
  v_v := pg_temp.vender(6, v_cx, 100, pg_temp.din(100));
  PERFORM set_config('request.jwt.claim.sub', v_g::text, true);
  PERFORM public.cancelar_venda_transacional(v_v, 'recon cancelamento');
  PERFORM pg_temp.medir('S6 venda 100 cancelada no mesmo caixa aberto', v_cx, 0);

  -- S7 devolução de 1 dos 2 itens (50) em dinheiro, caixa da venda ainda aberto
  v_cx := pg_temp.abrir(7, 0);
  v_v := pg_temp.vender(7, v_cx, 100, pg_temp.din(100));
  PERFORM set_config('request.jwt.claim.sub', v_g::text, true);
  PERFORM * FROM public.devolver_ou_trocar_venda(
    v_v, 'recon-dev-7', 'recon', 'DEVOLUCAO',
    jsonb_build_array(jsonb_build_object('item_venda_id', (SELECT id FROM public.itens_venda WHERE venda_id = v_v LIMIT 1), 'quantidade', 1)),
    50, 'DINHEIRO', NULL, v_g);
  PERFORM pg_temp.medir('S7 devolucao 50 dinheiro, caixa da venda aberto', v_cx, 50);
END
$cenarios_abertos$;

-- ═════════════ Cenários com caixa da venda já FECHADO (contrato proposto: sai do caixa ABERTO atual) ═════════════
DO $cenarios_fechados$
DECLARE
  v_a uuid; v_b uuid; v_v uuid; v_g uuid := 'f6000002-0000-4000-8000-000000000000';
BEGIN
  -- S8 devolução 50 dinheiro de venda do caixa A (fechado); operador do caixa B (aberto, fundo 100)
  v_a := pg_temp.abrir(8, 0);
  v_v := pg_temp.vender(8, v_a, 100, pg_temp.din(100));
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(8)::text, true);
  PERFORM * FROM public.fechar_caixa_atomico(pg_temp.op(8), 100, 'recon');
  v_b := pg_temp.abrir(9, 100);
  -- devolução exige GERENTE; o contrato precisa definir de qual gaveta sai o dinheiro (aqui: B é o único caixa aberto da loja)
  PERFORM set_config('request.jwt.claim.sub', v_g::text, true);
  PERFORM * FROM public.devolver_ou_trocar_venda(
    v_v, 'recon-dev-8', 'recon', 'DEVOLUCAO',
    jsonb_build_array(jsonb_build_object('item_venda_id', (SELECT id FROM public.itens_venda WHERE venda_id = v_v LIMIT 1), 'quantidade', 1)),
    50, 'DINHEIRO', NULL, v_g);
  PERFORM pg_temp.medir('S8a devolucao de venda de caixa fechado: caixa A (fechado, snapshot)', v_a, 100,
                        'fechamento já contado: não pode mudar depois');
  PERFORM pg_temp.medir('S8b devolucao de venda de caixa fechado: caixa B (aberto, pagou)', v_b, 50,
                        'o dinheiro físico saiu da gaveta B');

  -- S9 cancelamento de venda do caixa C (fechado), gerente; caixa D aberto com fundo 100
  v_a := pg_temp.abrir(10, 0);
  v_v := pg_temp.vender(10, v_a, 100, pg_temp.din(100));
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(10)::text, true);
  PERFORM * FROM public.fechar_caixa_atomico(pg_temp.op(10), 100, 'recon');
  v_b := pg_temp.abrir(11, 100);
  PERFORM set_config('request.jwt.claim.sub', v_g::text, true);
  PERFORM public.cancelar_venda_transacional(v_v, 'recon cancelamento de caixa fechado');
  PERFORM pg_temp.medir('S9a cancelamento de venda de caixa fechado: caixa C (fechado, snapshot)', v_a, 100);
  PERFORM pg_temp.medir('S9b cancelamento de venda de caixa fechado: caixa D (aberto, pagou)', v_b, 0);
END
$cenarios_fechados$;

-- ═════════════ Relatório ═════════════
DO $relatorio$
DECLARE
  r record;
  v_div int := 0;
BEGIN
  RAISE NOTICE E'\n%-58s | saldo_atual | sistema | esperado | veredito', 'cenario';
  FOR r IN SELECT * FROM recon ORDER BY ord LOOP
    RAISE NOTICE '% | % | % | % | %', rpad(r.cenario, 78), r.saldo, r.sistema, r.esperado,
      CASE
        WHEN r.saldo = r.esperado AND r.sistema = r.esperado THEN 'OK'
        WHEN r.saldo <> r.esperado AND r.sistema <> r.esperado THEN 'AMBOS DIVERGEM'
        WHEN r.saldo <> r.esperado THEN 'saldo_atual diverge'
        ELSE 'sistema diverge'
      END;
    IF r.saldo <> r.esperado OR r.sistema <> r.esperado THEN v_div := v_div + 1; END IF;
  END LOOP;
  IF v_div > 0 THEN
    RAISE EXCEPTION 'caixa-reconciliacao-contrato: % cenario(s) divergem do contrato proposto', v_div;
  END IF;
  RAISE NOTICE 'caixa-reconciliacao-contrato OK';
END
$relatorio$;

ROLLBACK;
