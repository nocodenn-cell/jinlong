-- PR-2D — devolução com caixa pagador (D-2/D-3/D-7) e conciliação D-13.
-- Prova as invariantes A-1…A-9 aplicáveis à devolução e as 5 regras de D-13.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/devolucao-d13-caixa-desembolso.test.sql
--
-- Cada cenário roda numa LOJA própria para controlar o número de caixas abertos elegíveis (0/1/N).
-- Dados sintéticos; tudo dentro de uma transação com ROLLBACK. Produto: R$ 25,00 (venda de R$ 100 = 4 un).

\set ON_ERROR_STOP on
BEGIN;

-- ── identidades determinísticas ─────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.lid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f7000001-0000-4000-8000-00000000000' || l)::uuid $$;
CREATE FUNCTION pg_temp.gid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f7000006-0000-4000-8000-00000000000' || l)::uuid $$;
CREATE FUNCTION pg_temp.pid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f7000004-0000-4000-8000-00000000000' || l)::uuid $$;
CREATE FUNCTION pg_temp.cid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f7000005-0000-4000-8000-00000000000' || l)::uuid $$;
CREATE FUNCTION pg_temp.op(n int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f7000002-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;

CREATE FUNCTION pg_temp.assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
  RAISE NOTICE 'OK   %', p_msg;
END $$;

DO $setup$
DECLARE l int; v_cat uuid := 'f7000003-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO public.categorias (id, nome) VALUES (v_cat, 'D13 Cat') ON CONFLICT (id) DO NOTHING;
  FOR l IN 1..9 LOOP
    INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (pg_temp.lid(l), 'D13 Loja ' || l, 'D13L' || l, true)
    ON CONFLICT (id) DO UPDATE SET ativo = true;
    INSERT INTO auth.users (id) VALUES (pg_temp.gid(l)) ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES (pg_temp.gid(l), 'D13 Gerente ' || l, 'GERENTE', true, pg_temp.lid(l))
    ON CONFLICT (id) DO UPDATE SET perfil = 'GERENTE', ativo = true, loja_id = pg_temp.lid(l);
    INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
    VALUES (pg_temp.pid(l), '789999997' || l || '010', 'D13 Produto ' || l, v_cat, 25.00, 'brasil_nf', false, true, pg_temp.lid(l))
    ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = pg_temp.lid(l), preco_varejo = 25.00;
    INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES (pg_temp.pid(l), pg_temp.lid(l), 1000, 0)
    ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 1000;
    INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo) VALUES
      (pg_temp.lid(l), 'DINHEIRO', 'Dinheiro', true), (pg_temp.lid(l), 'PIX', 'Pix', true)
    ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;
    INSERT INTO public.clientes (id, nome, loja_id, limite_credito) VALUES (pg_temp.cid(l), 'D13 Cliente ' || l, pg_temp.lid(l), 1000)
    ON CONFLICT (id) DO UPDATE SET loja_id = pg_temp.lid(l), limite_credito = 1000;
  END LOOP;
END
$setup$;

-- ── helpers ─────────────────────────────────────────────────────────────────────────────────────
-- Abre caixa para o operador n na loja l (cria o operador na primeira vez).
CREATE FUNCTION pg_temp.abrir(n int, l int, fundo numeric) RETURNS uuid LANGUAGE plpgsql AS
$$
DECLARE v uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (pg_temp.op(n)) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES (pg_temp.op(n), 'D13 Op ' || n, 'OPERADOR', true, pg_temp.lid(l))
  ON CONFLICT (id) DO UPDATE SET perfil = 'OPERADOR', ativo = true, loja_id = pg_temp.lid(l);
  DELETE FROM public.caixas WHERE operador_id = pg_temp.op(n);
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(n)::text, true);
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
  VALUES (pg_temp.op(n), 'ABERTO', now(), fundo, pg_temp.lid(l)) RETURNING id INTO v;
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.fechar(n int, contado numeric) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(n)::text, true);
  PERFORM * FROM public.fechar_caixa_atomico(pg_temp.op(n), contado, 'd13');
END $$;

CREATE FUNCTION pg_temp.din(p numeric) RETURNS jsonb LANGUAGE sql AS
$$ SELECT jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', p)) $$;
CREATE FUNCTION pg_temp.pix(p numeric) RETURNS jsonb LANGUAGE sql AS
$$ SELECT jsonb_build_array(jsonb_build_object('forma_pagamento', 'PIX', 'valor', p)) $$;

-- Venda de p_total (múltiplo de 25) pelo operador n da loja l. Saldo (total - pago) exige cliente.
CREATE FUNCTION pg_temp.vender(n int, l int, p_caixa uuid, p_total numeric, p_pag jsonb, p_cliente uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS
$$
DECLARE v_id uuid := gen_random_uuid(); r record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(n)::text, true);
  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    v_id, p_caixa, pg_temp.op(n), pg_temp.lid(l), (p_pag->0->>'forma_pagamento'), p_total, 0, p_total, p_pag,
    jsonb_build_array(jsonb_build_object(
      'item_id', gen_random_uuid(), 'produto_id', pg_temp.pid(l), 'quantidade', p_total / 25,
      'preco_original', 25, 'preco_unitario', 25, 'tipo_preco', 'VAREJO')),
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, p_cliente);
  IF r.status IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'SETUP_FALHOU: venda nao concluiu (% / %)', r.status, r.mensagem;
  END IF;
  RETURN v_id;
END $$;

-- Devolução como gerente da loja l (ou 'quem' informado). Retorna NULL se aceita; senão a mensagem de erro.
CREATE FUNCTION pg_temp.dev(l int, p_venda uuid, p_qtd numeric, p_key text, p_forma text,
                            p_caixa uuid DEFAULT NULL, p_quem uuid DEFAULT NULL, p_operador_arg uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS
$$
DECLARE v_item uuid;
BEGIN
  SELECT id INTO v_item FROM public.itens_venda WHERE venda_id = p_venda LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_quem, pg_temp.gid(l))::text, true);
  BEGIN
    PERFORM * FROM public.devolver_ou_trocar_venda(
      p_venda, p_key, 'motivo d13', 'DEVOLUCAO',
      jsonb_build_array(jsonb_build_object('item_venda_id', v_item, 'quantidade', p_qtd)),
      25 * p_qtd, p_forma, NULL, p_operador_arg, p_caixa);
    RETURN NULL;
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
  END;
END $$;

CREATE FUNCTION pg_temp.auth(p_caixa uuid) RETURNS numeric LANGUAGE sql AS
$$ SELECT internal.valor_sistema_dinheiro(p_caixa) $$;
CREATE FUNCTION pg_temp.cache(p_caixa uuid) RETURNS numeric LANGUAGE sql AS
$$ SELECT saldo_atual FROM public.caixas WHERE id = p_caixa $$;
CREATE FUNCTION pg_temp.n_dev(p_venda uuid) RETURNS bigint LANGUAGE sql AS
$$ SELECT count(*) FROM public.venda_pos_venda_operacoes WHERE venda_id = p_venda $$;
CREATE FUNCTION pg_temp.estoque(l int) RETURNS numeric LANGUAGE sql AS
$$ SELECT quantidade_atual FROM public.estoque WHERE produto_id = pg_temp.pid(l) AND loja_id = pg_temp.lid(l) $$;

-- ═══ A-6 estático: a função NÃO decide por saldo_atual ═══════════════════════════════════════════
DO $a6_estatico$
BEGIN
  PERFORM pg_temp.assert(
    (SELECT p.prosrc !~* 'saldo_atual' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'devolver_ou_trocar_venda'),
    'A-6: devolver_ou_trocar_venda não referencia saldo_atual (guard pela autoridade)');
END $a6_estatico$;

-- ═══ T1 — caixa da venda aberto e único elegível: seleção automática (D-3) ═════════════════════════
DO $t1$
DECLARE cx uuid; v uuid; e text;
BEGIN
  cx := pg_temp.abrir(1, 1, 50);
  v := pg_temp.vender(1, 1, cx, 100, pg_temp.din(100));
  e := pg_temp.dev(1, v, 2, 'd13-t1', 'DINHEIRO');
  PERFORM pg_temp.assert(e IS NULL, 'T1 devolução aceita com 1 caixa aberto elegível e sem p_caixa_id (' || coalesce(e, 'ok') || ')');
  PERFORM pg_temp.assert(pg_temp.auth(cx) = 100, 'T1 autoridade = fundo 50 + venda 100 - devolução 50 = 100');
  PERFORM pg_temp.assert(pg_temp.cache(cx) = pg_temp.auth(cx), 'T1 cache saldo_atual = autoridade (derivado)');
  PERFORM pg_temp.assert(
    (SELECT d.caixa_desembolso_id FROM public.devolucoes d JOIN public.venda_pos_venda_operacoes o ON o.id = d.operacao_id
      WHERE o.venda_id = v AND d.forma_pagamento = 'DINHEIRO') = cx,
    'A-2 T1 linha de devolução em dinheiro tem caixa_desembolso_id = caixa pagador');
  PERFORM pg_temp.assert(
    (SELECT o.caixa_desembolso_id = cx AND o.valor_caixa_estornado = 50 AND o.valor_abatido_ar = 0
       FROM public.venda_pos_venda_operacoes o WHERE o.venda_id = v),
    'T1 operação: caixa_desembolso_id, valor_caixa_estornado=50 e valor_abatido_ar=0');
END $t1$;

-- ═══ T2 — A-1/D-2: venda de caixa FECHADO; devolução sai do caixa aberto; o fechado fica intacto ═══════
DO $t2$
DECLARE a uuid; b uuid; v uuid; e text; a_auth numeric; a_cache numeric;
BEGIN
  a := pg_temp.abrir(2, 2, 0);
  v := pg_temp.vender(2, 2, a, 100, pg_temp.din(100));
  PERFORM pg_temp.fechar(2, 100);
  b := pg_temp.abrir(3, 2, 100);
  a_auth := pg_temp.auth(a); a_cache := pg_temp.cache(a);
  e := pg_temp.dev(2, v, 2, 'd13-t2', 'DINHEIRO');
  PERFORM pg_temp.assert(e IS NULL, 'T2 devolução de venda de caixa fechado aceita, paga pelo único caixa aberto (' || coalesce(e, 'ok') || ')');
  PERFORM pg_temp.assert(pg_temp.auth(a) = a_auth AND pg_temp.auth(a) = 100,
    'A-1 T2 caixa FECHADO: autoridade idêntica antes/depois (100)');
  PERFORM pg_temp.assert(pg_temp.cache(a) = a_cache, 'A-1 T2 caixa FECHADO: saldo_atual idêntico antes/depois');
  PERFORM pg_temp.assert(pg_temp.auth(b) = 50, 'T2 caixa pagador B: 100 - 50 = 50');
  PERFORM pg_temp.assert(
    (SELECT o.caixa_desembolso_id = b AND o.caixa_id = a FROM public.venda_pos_venda_operacoes o WHERE o.venda_id = v),
    'T2 operação preserva caixa da venda (caixa_id=A) e registra o pagador (B)');
END $t2$;

-- ═══ T3 — A-3: 0 / 1 / N caixas; determinismo; nada muda ao rejeitar ═══════════════════════════════
DO $t3$
DECLARE a uuid; b uuid; c uuid; v uuid; e text; est numeric;
BEGIN
  -- L3: A fechado (origem), B e C abertos
  a := pg_temp.abrir(4, 3, 0);
  v := pg_temp.vender(4, 3, a, 100, pg_temp.din(100));
  PERFORM pg_temp.fechar(4, 100);
  b := pg_temp.abrir(5, 3, 100);
  c := pg_temp.abrir(6, 3, 100);
  est := pg_temp.estoque(3);

  e := pg_temp.dev(3, v, 2, 'd13-t3-a', 'DINHEIRO');
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_CAIXA_OBRIGATORIO', 'A-3 T3 com 2 caixas abertos e sem p_caixa_id → CAIXA_OBRIGATORIO (' || coalesce(e, 'aceita') || ')');
  PERFORM pg_temp.assert(pg_temp.n_dev(v) = 0 AND pg_temp.estoque(3) = est AND pg_temp.auth(b) = 100 AND pg_temp.auth(c) = 100,
    'A-3 T3 rejeição não deixa efeito algum (sem operação, estoque e caixas iguais)');

  e := pg_temp.dev(3, v, 2, 'd13-t3-b', 'DINHEIRO', c);
  PERFORM pg_temp.assert(e IS NULL, 'T3 com p_caixa_id explícito (C) → aceita (' || coalesce(e, 'ok') || ')');
  PERFORM pg_temp.assert(pg_temp.auth(c) = 50 AND pg_temp.auth(b) = 100 AND pg_temp.auth(a) = 100,
    'T3 só C paga; B e o fechado A intactos');

  -- caixa fechado informado, caixa de outra loja e usuário sem perfil
  e := pg_temp.dev(3, v, 1, 'd13-t3-c', 'DINHEIRO', a);
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_CAIXA_INVALIDO', 'A-3 T3 caixa FECHADO informado → CAIXA_INVALIDO (' || coalesce(e, 'aceita') || ')');
  e := pg_temp.dev(3, v, 1, 'd13-t3-d', 'DINHEIRO', (SELECT id FROM public.caixas WHERE operador_id = pg_temp.op(1)));
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_CAIXA_INVALIDO', 'A-5 T3 caixa de OUTRA loja → CAIXA_INVALIDO (' || coalesce(e, 'aceita') || ')');
  e := pg_temp.dev(3, v, 1, 'd13-t3-e', 'DINHEIRO', c, pg_temp.op(5));
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_SEM_PERMISSAO', 'T3 operador (não gerente) → SEM_PERMISSAO (' || coalesce(e, 'aceita') || ')');
END $t3$;

-- T3b — determinismo: a ordem de criação dos caixas não muda o resultado (L4: B antes de C e C antes de B)
DO $t3b$
DECLARE a uuid; b uuid; c uuid; v uuid; e1 text; e2 text; a2 uuid; b2 uuid; c2 uuid; v2 uuid;
BEGIN
  a := pg_temp.abrir(7, 4, 0);  v := pg_temp.vender(7, 4, a, 100, pg_temp.din(100)); PERFORM pg_temp.fechar(7, 100);
  b := pg_temp.abrir(8, 4, 100); c := pg_temp.abrir(9, 4, 100);
  e1 := pg_temp.dev(4, v, 2, 'd13-t3b-1', 'DINHEIRO');
  a2 := pg_temp.abrir(10, 5, 0); v2 := pg_temp.vender(10, 5, a2, 100, pg_temp.din(100)); PERFORM pg_temp.fechar(10, 100);
  c2 := pg_temp.abrir(12, 5, 100); b2 := pg_temp.abrir(11, 5, 100);   -- ordem invertida
  e2 := pg_temp.dev(5, v2, 2, 'd13-t3b-2', 'DINHEIRO');
  PERFORM pg_temp.assert(e1 = 'DEVOLVER_VENDA_CAIXA_OBRIGATORIO' AND e2 = 'DEVOLVER_VENDA_CAIXA_OBRIGATORIO',
    'A-3 T3b resultado independe da ordem de criação (ambas rejeitam sem escolher)');
  -- 0 elegíveis
  PERFORM pg_temp.fechar(8, 100); PERFORM pg_temp.fechar(9, 100);
  e1 := pg_temp.dev(4, v, 2, 'd13-t3b-3', 'DINHEIRO');
  PERFORM pg_temp.assert(e1 = 'DEVOLVER_VENDA_SEM_CAIXA_ABERTO', 'A-3 T3b nenhum caixa aberto → SEM_CAIXA_ABERTO (' || coalesce(e1, 'aceita') || ')');
END $t3b$;

-- ═══ T4 — A-4: retry idempotente ═══════════════════════════════════════════════════════════════════
DO $t4$
DECLARE cx uuid; v uuid; e text; n1 bigint; est numeric; aut numeric; cx2 uuid;
BEGIN
  cx := pg_temp.abrir(13, 6, 0);
  v := pg_temp.vender(13, 6, cx, 100, pg_temp.din(100));
  e := pg_temp.dev(6, v, 2, 'd13-t4', 'DINHEIRO');
  n1 := pg_temp.n_dev(v); est := pg_temp.estoque(6); aut := pg_temp.auth(cx);
  e := pg_temp.dev(6, v, 2, 'd13-t4', 'DINHEIRO');
  PERFORM pg_temp.assert(e IS NULL AND pg_temp.n_dev(v) = n1 AND pg_temp.estoque(6) = est AND pg_temp.auth(cx) = aut
    AND (SELECT count(*) FROM public.devolucoes d JOIN public.venda_pos_venda_operacoes o ON o.id=d.operacao_id WHERE o.venda_id=v) = 1,
    'A-4 T4 retry com a mesma chave não duplica operação, devolução, estoque nem caixa');
  cx2 := pg_temp.abrir(14, 6, 0);
  e := pg_temp.dev(6, v, 2, 'd13-t4', 'DINHEIRO', cx2);
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_RETRY_CAIXA_DIVERGENTE', 'A-4 T4 retry com caixa divergente → RETRY_CAIXA_DIVERGENTE (' || coalesce(e, 'aceita') || ')');
END $t4$;

-- ═══ T5 — A-5: cross-loja e p_operador_id não amplia acesso ═══════════════════════════════════════
DO $t5$
DECLARE cx uuid; v uuid; e text;
BEGIN
  cx := pg_temp.abrir(15, 7, 0);
  v := pg_temp.vender(15, 7, cx, 100, pg_temp.din(100));
  e := pg_temp.dev(8, v, 2, 'd13-t5-a', 'DINHEIRO');     -- gerente da loja 8 tenta devolver venda da loja 7
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_SEM_PERMISSAO', 'A-5 T5 gerente de outra loja → SEM_PERMISSAO (' || coalesce(e, 'aceita') || ')');
  e := pg_temp.dev(8, v, 2, 'd13-t5-b', 'DINHEIRO', NULL, NULL, pg_temp.gid(7));  -- passa p_operador_id de gerente da loja 7
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_SEM_PERMISSAO', 'A-5 T5 p_operador_id é ignorado quando há sessão (auth.uid) (' || coalesce(e, 'aceita') || ')');
  PERFORM pg_temp.assert(pg_temp.n_dev(v) = 0 AND pg_temp.auth(cx) = 100, 'A-5 T5 nenhum efeito nas tentativas cross-loja');
END $t5$;

-- ═══ T6 — A-6/A-7: decisão pela autoridade, não pelo cache; guard de saldo ════════════════════════
DO $t6$
DECLARE cx uuid; v uuid; e text;
BEGIN
  cx := pg_temp.abrir(16, 8, 0);
  v := pg_temp.vender(16, 8, cx, 100, pg_temp.din(100));
  UPDATE public.caixas SET saldo_atual = 0 WHERE id = cx;          -- cache "mentiroso" baixo
  e := pg_temp.dev(8, v, 2, 'd13-t6-a', 'DINHEIRO');
  PERFORM pg_temp.assert(e IS NULL, 'A-6 T6 cache=0 mas autoridade=100 → devolução ACEITA (o cache não decide) (' || coalesce(e, 'ok') || ')');
  PERFORM pg_temp.assert(pg_temp.cache(cx) = pg_temp.auth(cx) AND pg_temp.auth(cx) = 50, 'A-6 T6 cache re-sincronizado com a autoridade (50)');
  UPDATE public.caixas SET saldo_atual = 9999 WHERE id = cx;       -- cache "mentiroso" alto
  e := pg_temp.dev(8, v, 4, 'd13-t6-b', 'DINHEIRO');               -- 100 > autoridade 50 ... item já devolvido 2 de 4 → só 2 restam
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_QTD_EXCEDE_VENDIDA', 'T6 sanity: quantidade acima do restante rejeitada (' || coalesce(e, 'aceita') || ')');
  -- saída maior que a autoridade: sangria tira o dinheiro e a devolução restante deve ser barrada mesmo com cache alto
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(16)::text, true);
  PERFORM public.registrar_movimentacao(cx, 'sangria', 'dinheiro', 40, 'd13', 'RETIRADA', NULL, NULL, gen_random_uuid()::text);
  UPDATE public.caixas SET saldo_atual = 9999 WHERE id = cx;
  e := pg_temp.dev(8, v, 2, 'd13-t6-c', 'DINHEIRO');               -- exige 50; autoridade = 10
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE', 'A-7 T6 cache=9999 mas autoridade=10 → SALDO_CAIXA_INSUFICIENTE (' || coalesce(e, 'aceita') || ')');
  PERFORM pg_temp.assert(pg_temp.n_dev(v) = 1, 'A-7 T6 rejeição por saldo não deixa operação');
END $t6$;

-- ═══ D-13 ══════════════════════════════════════════════════════════════════════════════════════════
-- D1 — venda 100% a prazo (simulada): sem dinheiro a devolver, sem saída de caixa, sem exigir caixa
DO $d1$
DECLARE cx uuid; v uuid; e text; tit record; op record;
BEGIN
  EXECUTE 'ALTER TABLE public.vendas ALTER COLUMN forma_pagamento DROP NOT NULL';   -- transacional; revertido no ROLLBACK
  cx := pg_temp.abrir(17, 9, 0);
  v := pg_temp.vender(17, 9, cx, 100, pg_temp.din(25), pg_temp.cid(9));             -- 25 pago + 75 a receber
  -- transforma em 100% a prazo: nenhum pagamento, sem forma, título de 100 em aberto
  DELETE FROM public.vendas_pagamentos WHERE venda_id = v;
  UPDATE public.vendas SET forma_pagamento = NULL WHERE id = v;
  UPDATE public.contas_receber SET valor_aberto = 100 WHERE venda_id = v;
  PERFORM pg_temp.fechar(17, 0);                                                     -- 0 caixas abertos na loja 9
  e := pg_temp.dev(9, v, 2, 'd13-d1-a', 'DINHEIRO');                                -- 50, forma DINHEIRO
  PERFORM pg_temp.assert(e IS NULL, 'D-13.1 100% a prazo: devolução aceita SEM exigir caixa (' || coalesce(e, 'ok') || ')');
  SELECT * INTO tit FROM public.contas_receber WHERE venda_id = v;
  SELECT * INTO op FROM public.venda_pos_venda_operacoes WHERE venda_id = v;
  PERFORM pg_temp.assert(tit.valor_aberto = 50 AND tit.status = 'PARCIAL', 'D-13.1 título abatido em 50 (aberto=50, PARCIAL)');
  PERFORM pg_temp.assert(op.valor_caixa_estornado = 0 AND op.caixa_desembolso_id IS NULL AND op.valor_abatido_ar = 50 AND op.forma_estorno = 'CREDITO_CLIENTE',
    'D-13.1 nenhuma saída de caixa; operação registra abatimento de AR = 50');
  PERFORM pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.devolucoes d WHERE d.operacao_id = op.id), 'D-13.1 nenhuma linha em devolucoes (não há dinheiro/meio devolvido)');
  -- segunda devolução, forma PIX: também só abate AR; e uma terceira acima do saldo em aberto é rejeitada
  e := pg_temp.dev(9, v, 2, 'd13-d1-b', 'PIX');
  PERFORM pg_temp.assert(e IS NULL AND (SELECT valor_aberto FROM public.contas_receber WHERE venda_id = v) = 0
    AND (SELECT status FROM public.contas_receber WHERE venda_id = v) = 'QUITADO', 'D-13.1 100% a prazo, forma PIX: abate AR até quitar (aberto=0)');
END $d1$;

-- D2 — parcial: reembolso em dinheiro limitado ao valor pago; parte em aberto nunca vira dinheiro
DO $d2$
DECLARE cx uuid; v uuid; e text; tit record; ops record; cash_out numeric;
BEGIN
  cx := pg_temp.abrir(18, 9, 0);
  v := pg_temp.vender(18, 9, cx, 100, pg_temp.din(60), pg_temp.cid(9));             -- pago 60, aberto 40
  PERFORM pg_temp.assert(pg_temp.auth(cx) = 60, 'D2 setup: só o pago (60) entrou no caixa');
  e := pg_temp.dev(9, v, 2, 'd13-d2-a', 'DINHEIRO');                                 -- 50 ≤ pago 60
  PERFORM pg_temp.assert(e IS NULL AND pg_temp.auth(cx) = 10, 'D-13.2 devolve 50 em dinheiro (≤ pago); caixa 60-50=10 (' || coalesce(e, 'ok') || ')');
  e := pg_temp.dev(9, v, 2, 'd13-d2-b', 'DINHEIRO');                                 -- 50 > pago restante 10 → 10 dinheiro + 40 abate AR
  PERFORM pg_temp.assert(e IS NULL, 'D-13.2 segunda devolução conciliada (10 dinheiro + 40 AR) (' || coalesce(e, 'ok') || ')');
  SELECT * INTO tit FROM public.contas_receber WHERE venda_id = v;
  PERFORM pg_temp.assert(tit.valor_aberto = 0 AND tit.status = 'QUITADO', 'D-13.2 título abatido em 40 (aberto=0)');
  PERFORM pg_temp.assert(pg_temp.auth(cx) = 0, 'D-13.2 saída de caixa total = 60 = valor efetivamente pago (caixa 0)');
  SELECT o.* INTO ops FROM public.venda_pos_venda_operacoes o WHERE o.idempotency_key = 'd13-d2-b';
  PERFORM pg_temp.assert(ops.valor_estornado = 50 AND ops.valor_abatido_ar = 40 AND ops.valor_caixa_estornado = 10 AND ops.forma_estorno = 'DINHEIRO',
    'D-13 conciliação da operação: 50 = 40 (AR) + 10 (dinheiro)');
  SELECT COALESCE(sum(d.valor), 0) INTO cash_out FROM public.devolucoes d JOIN public.venda_pos_venda_operacoes o ON o.id = d.operacao_id
   WHERE o.venda_id = v AND d.forma_pagamento = 'DINHEIRO';
  PERFORM pg_temp.assert(cash_out = 60, 'A-9 D2 Σ dinheiro devolvido (60) ≤ valor pago (60)');
  PERFORM pg_temp.fechar(18, pg_temp.auth(cx));
END $d2$;

-- D3 — excedente sem saldo em aberto suficiente é rejeitado (não cria dinheiro nem dívida artificial)
DO $d3$
DECLARE cx uuid; v uuid; e text; aut numeric;
BEGIN
  cx := pg_temp.abrir(19, 9, 0);
  v := pg_temp.vender(19, 9, cx, 100, pg_temp.din(60), pg_temp.cid(9));             -- pago 60, aberto 40
  UPDATE public.contas_receber SET valor_aberto = 10 WHERE venda_id = v;             -- aberto (10) < excedente possível
  aut := pg_temp.auth(cx);
  e := pg_temp.dev(9, v, 4, 'd13-d3', 'DINHEIRO');                                   -- 100: 60 dinheiro + 40 AR, mas só 10 em aberto
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_EXCEDE_VALOR_PAGO', 'D-13.2 excedente maior que o saldo em aberto → EXCEDE_VALOR_PAGO (' || coalesce(e, 'aceita') || ')');
  PERFORM pg_temp.assert(pg_temp.n_dev(v) = 0 AND pg_temp.auth(cx) = aut AND (SELECT valor_aberto FROM public.contas_receber WHERE venda_id = v) = 10,
    'D-13.2 rejeição sem efeito (sem operação, caixa e título intactos)');
  PERFORM pg_temp.fechar(19, pg_temp.auth(cx));
END $d3$;

-- D4 — título com liquidação ativa bloqueia; após estornar a liquidação a devolução passa
DO $d4$
DECLARE cx uuid; v uuid; e text; tit uuid; liq uuid;
BEGIN
  cx := pg_temp.abrir(20, 9, 0);
  v := pg_temp.vender(20, 9, cx, 100, pg_temp.din(60), pg_temp.cid(9));             -- aberto 40
  SELECT id INTO tit FROM public.contas_receber WHERE venda_id = v;
  PERFORM set_config('request.jwt.claim.sub', pg_temp.gid(9)::text, true);
  PERFORM * FROM public.registrar_liquidacao_receber(tit, 40, 'DINHEIRO', NULL, 'd13-liq', cx, 'D13');
  e := pg_temp.dev(9, v, 2, 'd13-d4-a', 'DINHEIRO');
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_TITULO_COM_LIQUIDACAO', 'D-13.3 liquidação ativa bloqueia a devolução (' || coalesce(e, 'aceita') || ')');
  PERFORM pg_temp.assert(pg_temp.n_dev(v) = 0, 'D-13.3 bloqueio sem efeito algum');
  SELECT id INTO liq FROM public.liquidacoes_receber WHERE titulo_id = tit AND COALESCE(operacao_tipo, 'RECEBIMENTO') = 'RECEBIMENTO';
  PERFORM set_config('request.jwt.claim.sub', pg_temp.gid(9)::text, true);
  PERFORM * FROM public.estornar_liquidacao_receber(liq, 'estorno d13', 'd13-estorno', 'D13');
  e := pg_temp.dev(9, v, 2, 'd13-d4-b', 'DINHEIRO');
  PERFORM pg_temp.assert(e IS NULL, 'D-13.3 após estornar a liquidação a devolução é aceita (' || coalesce(e, 'ok') || ')');
  PERFORM pg_temp.fechar(20, pg_temp.auth(cx));
END $d4$;

-- D5 — CREDITO_CLIENTE puro: comportamento existente preservado (abate AR; sem caixa; linha legada 'PIX')
DO $d5$
DECLARE cx uuid; v uuid; e text; op record;
BEGIN
  cx := pg_temp.abrir(21, 9, 0);
  v := pg_temp.vender(21, 9, cx, 100, pg_temp.din(60), pg_temp.cid(9));             -- aberto 40
  e := pg_temp.dev(9, v, 1, 'd13-d5-a', 'CREDITO_CLIENTE');                          -- 25 ≤ aberto 40
  SELECT * INTO op FROM public.venda_pos_venda_operacoes WHERE idempotency_key = 'd13-d5-a';
  PERFORM pg_temp.assert(e IS NULL AND op.valor_abatido_ar = 25 AND op.valor_caixa_estornado = 0 AND op.caixa_desembolso_id IS NULL
    AND (SELECT valor_aberto FROM public.contas_receber WHERE venda_id = v) = 15, 'D-13.4 CREDITO_CLIENTE puro abate AR (25) sem tocar o caixa (' || coalesce(e, 'ok') || ')');
  PERFORM pg_temp.assert(pg_temp.auth(cx) = 60, 'D-13.4 caixa inalterado (60)');
  e := pg_temp.dev(9, v, 2, 'd13-d5-b', 'CREDITO_CLIENTE');                          -- 50 > aberto 15
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_VALOR_EXCEDE_ABERTO', 'D-13.4 CREDITO_CLIENTE acima do saldo em aberto → VALOR_EXCEDE_ABERTO (' || coalesce(e, 'aceita') || ')');
END $d5$;

-- ═══ A-9 / A-2 — varredura de invariantes sobre TODAS as operações criadas neste teste ═════════════
DO $varredura$
DECLARE r record; n int := 0; soma_meio numeric; v_pago numeric;
BEGIN
  FOR r IN SELECT o.* FROM public.venda_pos_venda_operacoes o WHERE o.idempotency_key LIKE 'd13-%' LOOP
    n := n + 1;
    SELECT COALESCE(sum(d.valor), 0) INTO soma_meio FROM public.devolucoes d
     WHERE d.operacao_id = r.id AND r.forma_estorno <> 'CREDITO_CLIENTE';
    IF r.forma_estorno = 'CREDITO_CLIENTE' THEN
      PERFORM pg_temp.assert(r.valor_estornado = r.valor_abatido_ar, 'A-9 op ' || r.idempotency_key || ': valor_estornado = valor_abatido_ar');
    ELSE
      PERFORM pg_temp.assert(round(r.valor_estornado - r.valor_abatido_ar - soma_meio, 2) = 0,
        'A-9 op ' || r.idempotency_key || ': valor_estornado = abatimento de AR + meio devolvido');
    END IF;
    PERFORM pg_temp.assert(r.valor_caixa_estornado <= soma_meio + 0.001, 'A-9 op ' || r.idempotency_key || ': saída de caixa ≤ meio devolvido');
    IF r.valor_caixa_estornado > 0 THEN
      PERFORM pg_temp.assert(r.caixa_desembolso_id IS NOT NULL, 'A-2 op ' || r.idempotency_key || ': saída em dinheiro tem caixa pagador');
    END IF;
  END LOOP;
  PERFORM pg_temp.assert(n >= 10, 'varredura cobriu ' || n || ' operações');

  -- Nenhuma devolução em dinheiro deste teste sem caixa pagador; e por venda: dinheiro devolvido ≤ valor pago
  PERFORM pg_temp.assert(NOT EXISTS (
    SELECT 1 FROM public.devolucoes d JOIN public.venda_pos_venda_operacoes o ON o.id = d.operacao_id
     WHERE o.idempotency_key LIKE 'd13-%' AND d.forma_pagamento = 'DINHEIRO' AND d.caixa_desembolso_id IS NULL),
    'A-2 nenhuma linha de devolução em dinheiro sem caixa_desembolso_id');
  PERFORM pg_temp.assert(NOT EXISTS (
    SELECT 1 FROM public.venda_pos_venda_operacoes o
     WHERE o.idempotency_key LIKE 'd13-%'
     GROUP BY o.venda_id
    HAVING (SELECT COALESCE(sum(d.valor), 0) FROM public.devolucoes d JOIN public.venda_pos_venda_operacoes o2 ON o2.id = d.operacao_id
             WHERE o2.venda_id = o.venda_id AND o2.forma_estorno <> 'CREDITO_CLIENTE')
         > (SELECT COALESCE(sum(vp.valor), 0) FROM public.vendas_pagamentos vp WHERE vp.venda_id = o.venda_id) + 0.001
       AND EXISTS (SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = o.venda_id)),
    'A-9 por venda: meio devolvido ≤ valor efetivamente pago');
  PERFORM pg_temp.assert(NOT EXISTS (
    SELECT 1 FROM public.contas_receber cr WHERE cr.valor_aberto < 0 OR cr.valor_aberto > cr.valor_total),
    'A-9 contas_receber: 0 ≤ valor_aberto ≤ valor_total em todos os títulos');
  PERFORM pg_temp.assert(NOT EXISTS (
    SELECT 1 FROM public.caixas c WHERE c.status = 'ABERTO' AND c.operador_id IN (SELECT pg_temp.op(g) FROM generate_series(1, 21) g)
      AND c.operador_id <> pg_temp.op(16)   -- op 16: cache envenenado de propósito no T6
      AND c.saldo_atual <> internal.valor_sistema_dinheiro(c.id)),
    'A-6/A-8 cache saldo_atual = autoridade em todos os caixas abertos tocados');
END $varredura$;

DO $fim$ BEGIN RAISE NOTICE 'devolucao-d13-caixa-desembolso OK'; END $fim$;
ROLLBACK;
