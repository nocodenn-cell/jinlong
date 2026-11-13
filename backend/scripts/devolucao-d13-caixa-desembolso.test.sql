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
CREATE FUNCTION pg_temp.lid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f7000001-0000-4000-8000-0000000000' || lpad(l::text, 2, '0'))::uuid $$;
CREATE FUNCTION pg_temp.gid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f7000006-0000-4000-8000-0000000000' || lpad(l::text, 2, '0'))::uuid $$;
CREATE FUNCTION pg_temp.pid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f7000004-0000-4000-8000-0000000000' || lpad(l::text, 2, '0'))::uuid $$;
CREATE FUNCTION pg_temp.cid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f7000005-0000-4000-8000-0000000000' || lpad(l::text, 2, '0'))::uuid $$;
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
  FOR l IN 1..16 LOOP
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
    -- D5 (20261107110000): PIX exige conta financeira vinculada à forma na loja.
    INSERT INTO public.contas_financeiras (id, loja_id, nome, tipo, ativo, data_inicial, criado_por)
    SELECT ('f7000007-0000-4000-8000-0000000000' || lpad(l::text, 2, '0'))::uuid, pg_temp.lid(l), 'D13 Banco ' || l, 'BANCO', true, current_date, pg_temp.gid(l)
    WHERE NOT EXISTS (SELECT 1 FROM public.contas_financeiras WHERE id = ('f7000007-0000-4000-8000-0000000000' || lpad(l::text, 2, '0'))::uuid);
    INSERT INTO public.financeiro_contas_forma (loja_id, forma_pagamento, conta_financeira_id)
    SELECT pg_temp.lid(l), 'PIX', ('f7000007-0000-4000-8000-0000000000' || lpad(l::text, 2, '0'))::uuid
    WHERE NOT EXISTS (SELECT 1 FROM public.financeiro_contas_forma WHERE loja_id = pg_temp.lid(l) AND forma_pagamento = 'PIX');
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
  -- multiempresa: o envelope pode recusar antes (ACESSO_LOJA_NEGADO) — também é rejeição válida
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_CAIXA_INVALIDO' OR e LIKE 'ACESSO_LOJA_NEGADO%', 'A-5 T3 caixa de OUTRA loja → CAIXA_INVALIDO (' || coalesce(e, 'aceita') || ')');
  e := pg_temp.dev(3, v, 1, 'd13-t3-e', 'DINHEIRO', c, pg_temp.op(5));
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_SEM_PERMISSAO' OR e LIKE 'ACESSO_LOJA_NEGADO%', 'T3 operador (não gerente) → SEM_PERMISSAO (' || coalesce(e, 'aceita') || ')');
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
  PERFORM pg_temp.assert((e = 'DEVOLVER_VENDA_SEM_PERMISSAO' OR e LIKE 'ACESSO_LOJA_NEGADO%'), 'A-5 T5 gerente de outra loja → SEM_PERMISSAO (' || coalesce(e, 'aceita') || ')');
  e := pg_temp.dev(8, v, 2, 'd13-t5-b', 'DINHEIRO', NULL, NULL, pg_temp.gid(7));  -- passa p_operador_id de gerente da loja 7
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_SEM_PERMISSAO' OR e LIKE 'ACESSO_LOJA_NEGADO%', 'A-5 T5 p_operador_id é ignorado quando há sessão (auth.uid) (' || coalesce(e, 'aceita') || ')');
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
  -- Conclui os eventos das vendas anteriores antes da alteração de schema da fixture.
  SET CONSTRAINTS ALL IMMEDIATE;
  EXECUTE 'ALTER TABLE public.vendas ALTER COLUMN forma_pagamento DROP NOT NULL';   -- transacional; revertido no ROLLBACK
  SET CONSTRAINTS ALL DEFERRED;
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

-- ═══ T7 — caixa FECHADO imutável: nenhuma devolução nova altera saldo, fechamento, valor esperado nem movimentações ═══
DO $t7$
DECLARE a uuid; b uuid; v uuid; e text;
  row_antes jsonb; row_depois jsonb; mov_antes text; mov_depois text; liq_antes bigint; liq_depois bigint;
  aut_antes numeric; aut_depois numeric; esperado_fech numeric;
BEGIN
  a := pg_temp.abrir(30, 10, 0);
  v := pg_temp.vender(30, 10, a, 100, pg_temp.din(100));
  PERFORM set_config('request.jwt.claim.sub', pg_temp.op(30)::text, true);
  PERFORM public.registrar_movimentacao(a, 'sangria', 'dinheiro', 20, 'd13', 'RETIRADA', NULL, NULL, gen_random_uuid()::text);
  PERFORM public.registrar_movimentacao(a, 'suprimento', 'dinheiro', 10, 'd13', 'TROCO', NULL, NULL, gen_random_uuid()::text);
  PERFORM pg_temp.fechar(30, pg_temp.auth(a));                       -- fechamento sem diferença: esperado = contado = 90
  b := pg_temp.abrir(31, 10, 100);

  SELECT to_jsonb(c.*) INTO row_antes FROM public.caixas c WHERE c.id = a;
  SELECT COALESCE(string_agg(m.id::text || ':' || m.tipo || ':' || m.valor || ':' || m.status || ':' || m.saldo_antes || ':' || m.saldo_depois, ',' ORDER BY m.id), '')
    INTO mov_antes FROM public.movimentacoes_caixa m WHERE m.caixa_id = a;
  SELECT count(*) INTO liq_antes FROM public.liquidacoes_receber l WHERE l.caixa_id = a;
  aut_antes := pg_temp.auth(a);
  esperado_fech := (row_antes->>'valor_fechamento')::numeric - (row_antes->>'fechamento_diferenca')::numeric;
  PERFORM pg_temp.assert(aut_antes = esperado_fech, 'A-1 T7 antes: autoridade do fechado = snapshot do fechamento (valor_fechamento - diferença = ' || esperado_fech || ')');

  e := pg_temp.dev(10, v, 2, 'd13-t7-a', 'DINHEIRO');
  PERFORM pg_temp.assert(e IS NULL, 'T7 devolução de venda do caixa fechado aceita (paga por B) (' || coalesce(e, 'ok') || ')');
  e := pg_temp.dev(10, v, 2, 'd13-t7-b', 'PIX');
  PERFORM pg_temp.assert(e IS NULL, 'T7 segunda devolução (PIX) também aceita (' || coalesce(e, 'ok') || ')');

  SELECT to_jsonb(c.*) INTO row_depois FROM public.caixas c WHERE c.id = a;
  SELECT COALESCE(string_agg(m.id::text || ':' || m.tipo || ':' || m.valor || ':' || m.status || ':' || m.saldo_antes || ':' || m.saldo_depois, ',' ORDER BY m.id), '')
    INTO mov_depois FROM public.movimentacoes_caixa m WHERE m.caixa_id = a;
  SELECT count(*) INTO liq_depois FROM public.liquidacoes_receber l WHERE l.caixa_id = a;
  aut_depois := pg_temp.auth(a);
  PERFORM pg_temp.assert(row_antes = row_depois, 'A-1 T7 linha inteira do caixa fechado idêntica (saldo_atual, status, datas, valor_fechamento, fechamento_diferenca…)');
  PERFORM pg_temp.assert(aut_antes = aut_depois AND aut_depois = esperado_fech, 'A-1 T7 valor esperado (autoridade) do caixa fechado idêntico e igual ao snapshot do fechamento');
  PERFORM pg_temp.assert(mov_antes = mov_depois AND mov_antes <> '', 'A-1 T7 movimentações do caixa fechado idênticas (conteúdo e saldos)');
  PERFORM pg_temp.assert(liq_antes = liq_depois, 'A-1 T7 liquidações do caixa fechado idênticas');
  PERFORM pg_temp.assert(pg_temp.auth(b) = 50, 'T7 só o caixa pagador B foi afetado (100 - 50)');
END $t7$;

-- ═══ T8 — p_caixa_id inexistente ═══════════════════════════════════════════════════════════════════
DO $t8$
DECLARE cx uuid; v uuid; e text;
BEGIN
  cx := pg_temp.abrir(32, 11, 0);
  v := pg_temp.vender(32, 11, cx, 100, pg_temp.din(100));
  e := pg_temp.dev(11, v, 2, 'd13-t8', 'DINHEIRO', gen_random_uuid());
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_CAIXA_INVALIDO', 'A-3 T8 p_caixa_id inexistente → CAIXA_INVALIDO (' || coalesce(e, 'aceita') || ')');
  PERFORM pg_temp.assert(pg_temp.n_dev(v) = 0 AND pg_temp.auth(cx) = 100, 'A-3 T8 sem efeito');
END $t8$;

-- ═══ T9 — autorização: GERENTE/DONO seguem o contrato; operador só usa o próprio caixa ═══════════
CREATE FUNCTION pg_temp.resolver(p_caixa uuid, p_uid uuid) RETURNS text LANGUAGE plpgsql AS
$$ BEGIN RETURN internal.resolver_caixa_pagador(p_caixa, p_uid, 'X')::text;
EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END $$;

DO $t9$
DECLARE cx33 uuid; cx34 uuid; v uuid; e text; dono uuid := pg_temp.op(37); adm uuid := pg_temp.op(38);
BEGIN
  INSERT INTO auth.users (id) VALUES (dono), (adm) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (dono, 'D13 Dono', 'DONO', true, pg_temp.lid(12)), (adm, 'D13 Dono 2 (ex-ADMIN; #623 descontinuou ADMIN)', 'DONO', true, pg_temp.lid(12))
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  cx33 := pg_temp.abrir(33, 12, 0);
  v := pg_temp.vender(33, 12, cx33, 100, pg_temp.din(100));
  -- 1 caixa aberto: DONO e ADMIN da loja devolvem (perfil gerencial), cada um com sua chave
  e := pg_temp.dev(12, v, 1, 'd13-t9-dono', 'DINHEIRO', NULL, dono);
  PERFORM pg_temp.assert(e IS NULL, 'T9 DONO da loja devolve (' || coalesce(e, 'ok') || ')');
  e := pg_temp.dev(12, v, 1, 'd13-t9-admin', 'DINHEIRO', NULL, adm);
  PERFORM pg_temp.assert(e IS NULL, 'T9 segundo DONO da loja devolve (' || coalesce(e, 'ok') || ')');
  e := pg_temp.dev(12, v, 1, 'd13-t9-op', 'DINHEIRO', NULL, pg_temp.op(33));
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_SEM_PERMISSAO' OR e LIKE 'ACESSO_LOJA_NEGADO%', 'T9 OPERADOR não devolve (' || coalesce(e, 'aceita') || ')');

  -- 2 caixas abertos: operador só enxerga o próprio; gerencial precisa escolher
  cx34 := pg_temp.abrir(34, 12, 0);
  PERFORM pg_temp.assert(pg_temp.resolver(NULL, pg_temp.op(33)) = cx33::text, 'T9 resolvedor: operador com 2 caixas abertos na loja → seu único caixa elegível (automático)');
  PERFORM pg_temp.assert(pg_temp.resolver(cx34, pg_temp.op(33)) = 'X_CAIXA_INVALIDO', 'T9 resolvedor: operador não pode usar o caixa de OUTRO operador');
  PERFORM pg_temp.assert(pg_temp.resolver(cx34, pg_temp.op(34)) = cx34::text, 'T9 resolvedor: operador usa o próprio caixa');
  PERFORM pg_temp.assert(pg_temp.resolver(NULL, pg_temp.gid(12)) = 'X_CAIXA_OBRIGATORIO', 'T9 resolvedor: GERENTE com 2 abertos sem p_caixa_id → CAIXA_OBRIGATORIO');
  PERFORM pg_temp.assert(pg_temp.resolver(cx34, pg_temp.gid(12)) = cx34::text, 'T9 resolvedor: GERENTE escolhe qualquer caixa aberto da loja (D-8b)');
  PERFORM pg_temp.assert(pg_temp.resolver(cx34, dono) = cx34::text AND pg_temp.resolver(cx33, adm) = cx33::text, 'T9 resolvedor: DONOs da loja escolhem qualquer caixa aberto da loja');
  PERFORM pg_temp.assert(pg_temp.resolver(cx34, pg_temp.gid(13)) IN ('X_CAIXA_INVALIDO', 'X_SEM_CAIXA_ABERTO'), 'A-5 T9 resolvedor: gerente de OUTRA loja é bloqueado e nunca recebe o caixa alheio');
  PERFORM pg_temp.assert(pg_temp.resolver(NULL, NULL) = 'X_AUTH', 'T9 resolvedor: sem identidade → bloqueia');
END $t9$;

-- ═══ T10 — idempotência de operação MISTA (dinheiro + abatimento de AR): retry não duplica nada ═════════
DO $t10$
DECLARE cx uuid; v uuid; e text; n_dev bigint; n_ops bigint; est numeric; aut numeric; aberto numeric; st text; ar numeric; caixa_out numeric;
BEGIN
  cx := pg_temp.abrir(35, 13, 0);
  v := pg_temp.vender(35, 13, cx, 100, pg_temp.din(60), pg_temp.cid(13));            -- pago 60, aberto 40
  e := pg_temp.dev(13, v, 4, 'd13-t10', 'DINHEIRO');                                  -- 100 = 60 dinheiro + 40 abatimento
  PERFORM pg_temp.assert(e IS NULL, 'T10 operação mista registrada (' || coalesce(e, 'ok') || ')');
  SELECT count(*) INTO n_dev FROM public.devolucoes d JOIN public.venda_pos_venda_operacoes o ON o.id = d.operacao_id WHERE o.venda_id = v;
  SELECT count(*) INTO n_ops FROM public.venda_pos_venda_operacoes WHERE venda_id = v;
  est := pg_temp.estoque(13); aut := pg_temp.auth(cx);
  SELECT valor_aberto, status INTO aberto, st FROM public.contas_receber WHERE venda_id = v;
  SELECT valor_abatido_ar, valor_caixa_estornado INTO ar, caixa_out FROM public.venda_pos_venda_operacoes WHERE idempotency_key = 'd13-t10';
  PERFORM pg_temp.assert(ar = 40 AND caixa_out = 60 AND aberto = 0 AND st = 'QUITADO' AND aut = 0, 'T10 base: abatimento 40, dinheiro 60, título quitado por abatimento, caixa 0');

  e := pg_temp.dev(13, v, 4, 'd13-t10', 'DINHEIRO');                                  -- RETRY idêntico
  PERFORM pg_temp.assert(e IS NULL, 'T10 retry idêntico devolve a operação existente (' || coalesce(e, 'ok') || ')');
  e := pg_temp.dev(13, v, 4, 'd13-t10', 'DINHEIRO', (SELECT id FROM public.caixas WHERE operador_id = pg_temp.op(35)));  -- retry com o MESMO caixa
  PERFORM pg_temp.assert(e IS NULL, 'T10 retry informando o mesmo caixa também é idempotente (' || coalesce(e, 'ok') || ')');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.devolucoes d JOIN public.venda_pos_venda_operacoes o ON o.id = d.operacao_id WHERE o.venda_id = v) = n_dev
    AND (SELECT count(*) FROM public.venda_pos_venda_operacoes WHERE venda_id = v) = n_ops
    AND pg_temp.estoque(13) = est AND pg_temp.auth(cx) = aut
    AND (SELECT valor_aberto FROM public.contas_receber WHERE venda_id = v) = aberto
    AND (SELECT status FROM public.contas_receber WHERE venda_id = v) = st,
    'A-4 T10 retry não duplica devolução, operação, estoque, abatimento de crédito (AR) nem saída de caixa');
END $t10$;

-- ═══ T11 — D-13: reembolso FUNGÍVEL (não precisa ser pelo mesmo meio do pagamento original) ═══════════
DO $t11$
DECLARE cx uuid; v uuid; e text; soma_meio numeric;
BEGIN
  cx := pg_temp.abrir(36, 14, 100);
  v := pg_temp.vender(36, 14, cx, 100, pg_temp.pix(100));                              -- pago 100% em PIX
  PERFORM pg_temp.assert(pg_temp.auth(cx) = 100, 'T11 setup: venda em PIX não entrou no caixa (fundo 100)');
  e := pg_temp.dev(14, v, 2, 'd13-t11-a', 'DINHEIRO');                                  -- devolve 50 em DINHEIRO
  PERFORM pg_temp.assert(e IS NULL AND pg_temp.auth(cx) = 50, 'D-13 T11 venda paga em PIX pode ser devolvida em DINHEIRO até o valor pago (caixa 100 → 50) (' || coalesce(e, 'ok') || ')');
  e := pg_temp.dev(14, v, 2, 'd13-t11-b', 'CARTAO_CREDITO');                            -- devolve os outros 50 por outro meio
  PERFORM pg_temp.assert(e IS NULL, 'D-13 T11 o restante pode sair por qualquer outro meio (' || coalesce(e, 'ok') || ')');
  SELECT COALESCE(sum(d.valor), 0) INTO soma_meio FROM public.devolucoes d JOIN public.venda_pos_venda_operacoes o ON o.id = d.operacao_id WHERE o.venda_id = v;
  PERFORM pg_temp.assert(soma_meio = 100, 'D-13 T11 total devolvido em meios (100) = valor efetivamente pago (100), sem rastreio por forma');
  e := pg_temp.dev(14, v, 1, 'd13-t11-c', 'DINHEIRO');
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_QTD_EXCEDE_VENDIDA', 'D-13 T11 nada além do vendido/pago pode ser devolvido (' || coalesce(e, 'aceita') || ')');
END $t11$;

-- ═══ T12 — D-13: desconto da venda não é reembolsável; nunca se devolve mais que o pago ═════════════════
DO $t12$
DECLARE cx uuid; v uuid; e text; op1 record; op2 record; soma_meio numeric;
BEGIN
  cx := (SELECT id FROM public.caixas WHERE operador_id = pg_temp.op(32) AND status = 'ABERTO');  -- loja 11: único aberto
  v := pg_temp.vender(32, 11, cx, 100, pg_temp.din(100));
  -- simula desconto de venda (itens a preço cheio = 100; total líquido pago = 90)
  UPDATE public.vendas SET total_bruto = 100, total_desconto = 10, total_liquido = 90 WHERE id = v;
  UPDATE public.vendas_pagamentos SET valor = 90 WHERE venda_id = v;
  e := pg_temp.dev(11, v, 2, 'd13-t12-a', 'DINHEIRO');
  PERFORM pg_temp.assert(e IS NULL, 'D-13 T12 primeira devolução (2 un = 50) aceita (' || coalesce(e, 'ok') || ')');
  e := pg_temp.dev(11, v, 2, 'd13-t12-b', 'DINHEIRO');                                  -- 50 pedido; só 40 restam de valor pago
  PERFORM pg_temp.assert(e IS NULL, 'D-13 T12 devolver o restante de venda com desconto é aceito (não trava a devolução total) (' || coalesce(e, 'ok') || ')');
  SELECT * INTO op2 FROM public.venda_pos_venda_operacoes WHERE idempotency_key = 'd13-t12-b';
  PERFORM pg_temp.assert(op2.valor_estornado = 40 AND op2.valor_caixa_estornado = 40 AND op2.valor_abatido_ar = 0,
    'D-13 T12 valor efetivamente devolvido = 40 (desconto de 10 não reembolsado); valor_estornado = meio + abatimento');
  SELECT COALESCE(sum(d.valor), 0) INTO soma_meio FROM public.devolucoes d JOIN public.venda_pos_venda_operacoes o ON o.id = d.operacao_id WHERE o.venda_id = v;
  PERFORM pg_temp.assert(soma_meio = 90, 'A-9 T12 total devolvido (90) = valor pago (90): nunca acima do elegível');
END $t12$;

-- ═══ T13 — constraint do banco: conciliação da operação é invariante ═════════════════════════════════
DO $t13$
DECLARE v_msg text;
BEGIN
  BEGIN
    UPDATE public.venda_pos_venda_operacoes SET valor_abatido_ar = valor_estornado + 1
     WHERE idempotency_key = 'd13-t10';
    v_msg := NULL;
  EXCEPTION WHEN check_violation THEN v_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(v_msg LIKE '%venda_pos_venda_operacoes_conciliacao_chk%',
    'A-9 T13 o banco recusa operação com abatimento maior que o valor estornado (' || coalesce(v_msg, 'aceita') || ')');
  BEGIN
    UPDATE public.venda_pos_venda_operacoes SET valor_caixa_estornado = valor_estornado + 1
     WHERE idempotency_key = 'd13-t10';
    v_msg := NULL;
  EXCEPTION WHEN check_violation THEN v_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(v_msg LIKE '%venda_pos_venda_operacoes_conciliacao_chk%',
    'A-9 T13 o banco recusa saída de caixa maior que o valor estornado (' || coalesce(v_msg, 'aceita') || ')');
END $t13$;

-- ═══ T15 — D-13: o desconto já absorvido por devoluções anteriores é descontado da sobra aceitável ════════
-- Venda de 4 un x R$ 25 (itens 100), total líquido 90 (desconto implícito 10), pago 90. Mata a mutação que remove
-- `- v_desc_abs` do guard de excesso: sem ele, o desconto seria reutilizado e o absorvido total passaria de 10.
DO $t15$
DECLARE cx uuid; v uuid; e text; n_antes bigint; absorvido numeric;
BEGIN
  cx := pg_temp.abrir(70, 15, 0);
  v := pg_temp.vender(70, 15, cx, 100, pg_temp.din(100));
  UPDATE public.vendas SET total_bruto = 100, total_desconto = 10, total_liquido = 90 WHERE id = v;
  UPDATE public.vendas_pagamentos SET valor = 90 WHERE venda_id = v;
  e := pg_temp.dev(15, v, 2, 'd13-t15-a', 'DINHEIRO');                                  -- V=50: pago restante 40
  PERFORM pg_temp.assert(e IS NULL, 'D-13 T15 op1 (2 un = 50) aceita (' || coalesce(e, 'ok') || ')');
  UPDATE public.vendas_pagamentos SET valor = 69 WHERE venda_id = v;                      -- pago restante = 69 - 50 = 19
  e := pg_temp.dev(15, v, 1, 'd13-t15-b', 'DINHEIRO');                                  -- V=25: dinheiro 19 + sobra 6 absorvida
  PERFORM pg_temp.assert(e IS NULL, 'D-13 T15 op2 (1 un = 25: dinheiro 19 + 6 de desconto) aceita (' || coalesce(e, 'ok') || ')');
  UPDATE public.vendas_pagamentos SET valor = 72 WHERE venda_id = v;                      -- reabre pago restante = 72 - 69 = 3
  n_antes := pg_temp.n_dev(v);
  e := pg_temp.dev(15, v, 0.32, 'd13-t15-c', 'DINHEIRO');                               -- V=8: dinheiro 3 + sobra 5; só restam 4 de desconto
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_EXCEDE_VALOR_PAGO',
    'D-13 T15 op3 (sobra 5 > desconto restante 4) rejeitada (' || coalesce(e, 'aceita') || ')');
  PERFORM pg_temp.assert(pg_temp.n_dev(v) = n_antes
    AND NOT EXISTS (SELECT 1 FROM public.venda_pos_venda_operacoes WHERE idempotency_key = 'd13-t15-c')
    AND NOT EXISTS (SELECT 1 FROM public.devolucoes d JOIN public.venda_pos_venda_operacoes o ON o.id = d.operacao_id
                     WHERE o.venda_id = v AND o.idempotency_key = 'd13-t15-c'),
    'D-13 T15 op3 rejeitada não cria operação nem devolução');
  SELECT COALESCE(sum(COALESCE((SELECT sum(vpi.subtotal) FROM public.venda_pos_venda_itens vpi WHERE vpi.operacao_id = o.id), 0)
                      - o.valor_estornado), 0)
    INTO absorvido FROM public.venda_pos_venda_operacoes o WHERE o.venda_id = v;
  PERFORM pg_temp.assert(absorvido <= 10 + 0.01, 'D-13 T15 desconto absorvido total (' || absorvido || ') ≤ desconto da venda (10)');
END $t15$;

-- ═══ T16 — propriedades (60 vendas, seed fixa): invariantes contábeis de devoluções parciais repetidas ═════
DO $t16$
DECLARE cx uuid; v uuid; e text; i int; k int; u int; d numeric; total numeric; pago numeric; q numeric; rest numeric;
        n_ok int := 0; n_rej int := 0;
BEGIN
  PERFORM setseed(0.4321);
  UPDATE public.clientes SET limite_credito = 1000000 WHERE id = pg_temp.cid(16);
  cx := pg_temp.abrir(71, 16, 0);
  FOR i IN 1..60 LOOP
    u := 2 + floor(random() * 7)::int;
    total := 25 * u;
    IF random() < 0.4 THEN                                                                 -- a prazo parcial (sem desconto)
      pago := 25 * (1 + floor(random() * (u - 1))::int);
      v := pg_temp.vender(71, 16, cx, total, pg_temp.din(pago), pg_temp.cid(16));
    ELSE                                                                                   -- pago à vista, com ou sem desconto
      d := CASE WHEN random() < 0.5 THEN 0 ELSE 1 + floor(random() * (total / 5))::int END;
      v := pg_temp.vender(71, 16, cx, total, pg_temp.din(total));
      IF d > 0 THEN
        UPDATE public.vendas SET total_bruto = total, total_desconto = d, total_liquido = total - d WHERE id = v;
        UPDATE public.vendas_pagamentos SET valor = total - d WHERE venda_id = v;
      END IF;
    END IF;
    rest := u;
    FOR k IN 1..4 LOOP
      EXIT WHEN rest <= 0;
      q := CASE WHEN k = 4 THEN rest ELSE LEAST(rest, ceil(random() * rest * 4) / 4) END;
      e := pg_temp.dev(16, v, q, 'd13-prop-' || i || '-' || k, 'DINHEIRO');
      IF e IS NULL THEN n_ok := n_ok + 1; rest := rest - q;
      ELSE
        IF e NOT IN ('DEVOLVER_VENDA_EXCEDE_VALOR_PAGO', 'DEVOLVER_VENDA_VALOR_ZERO') THEN
          RAISE EXCEPTION 'FALHOU: T16 rejeição inesperada (%)', e;   -- só excesso/valor zero são rejeições legítimas
        END IF;
        n_rej := n_rej + 1;
      END IF;
    END LOOP;
  END LOOP;
  PERFORM pg_temp.assert(n_ok >= 60, 'T16 aceitou ' || n_ok || ' devoluções (' || n_rej || ' rejeitadas)');

  CREATE TEMP TABLE t16_ops ON COMMIT DROP AS
  SELECT o.venda_id, o.valor_estornado, o.valor_abatido_ar, o.valor_caixa_estornado,
         COALESCE((SELECT sum(dv.valor) FROM public.devolucoes dv WHERE dv.operacao_id = o.id), 0) AS meio,
         COALESCE((SELECT sum(vpi.subtotal) FROM public.venda_pos_venda_itens vpi WHERE vpi.operacao_id = o.id), 0) AS itens
    FROM public.venda_pos_venda_operacoes o WHERE o.idempotency_key LIKE 'd13-prop-%';
  PERFORM pg_temp.assert(NOT EXISTS (SELECT 1 FROM t16_ops WHERE abs(valor_estornado - (meio + valor_abatido_ar)) > 0.001),
    'T16 estornado = meio + abatido em toda operação');
  PERFORM pg_temp.assert(NOT EXISTS (
    SELECT 1 FROM (
      SELECT t.venda_id, sum(t.meio) AS meio, sum(t.valor_caixa_estornado) AS cx, sum(t.valor_abatido_ar) AS ar, sum(t.itens - t.valor_estornado) AS absorvido
        FROM t16_ops t GROUP BY t.venda_id) s
      JOIN public.vendas ve ON ve.id = s.venda_id
      CROSS JOIN LATERAL (SELECT COALESCE(sum(vp.valor), 0) AS pago FROM public.vendas_pagamentos vp WHERE vp.venda_id = s.venda_id) p
      CROSS JOIN LATERAL (SELECT COALESCE(sum(iv.preco_unitario * iv.quantidade), 0) AS itens FROM public.itens_venda iv WHERE iv.venda_id = s.venda_id) it
     WHERE NOT (s.cx <= s.meio + 0.001 AND s.meio <= p.pago + 0.001)                     -- caixa ≤ meio ≤ pago
        OR s.ar > GREATEST(0, ve.total_liquido - p.pago) + 0.001                           -- abatido ≤ financiado
        OR s.cx + s.ar > ve.total_liquido + 0.001                                          -- caixa + AR ≤ total líquido
        OR s.absorvido > GREATEST(0, it.itens - ve.total_liquido) + 0.01),                 -- absorvido ≤ desconto
    'T16 por venda: caixa ≤ meio ≤ pago; abatido ≤ financiado; caixa+AR ≤ total líquido; absorvido ≤ desconto');
END $t16$;
-- ═══ T14 — retry idempotente exige autorização: a chave de idempotência não é bypass nem oráculo ═════════
DO $t14$
DECLARE cx uuid; cx2 uuid; v uuid; e text; n1 bigint; aut numeric; est numeric;
BEGIN
  cx := pg_temp.abrir(41, 12, 0);
  cx2 := pg_temp.abrir(42, 12, 0);
  v := pg_temp.vender(41, 12, cx, 100, pg_temp.din(100));
  e := pg_temp.dev(12, v, 2, 'd13-t14', 'DINHEIRO', cx);                        -- o criador (gerente da loja 12) grava; loja 12 tem N caixas abertos → caixa explícito
  PERFORM pg_temp.assert(e IS NULL, 'T14 criador devolve (' || coalesce(e, 'ok') || ')');
  n1 := pg_temp.n_dev(v); aut := pg_temp.auth(cx); est := pg_temp.estoque(12);

  e := pg_temp.dev(12, v, 2, 'd13-t14', 'DINHEIRO', cx);                        -- retry do criador continua idempotente
  PERFORM pg_temp.assert(e IS NULL AND pg_temp.n_dev(v) = n1 AND pg_temp.auth(cx) = aut AND pg_temp.estoque(12) = est,
    'T14 criador repetindo a chave continua idempotente (' || coalesce(e, 'ok') || ')');

  e := pg_temp.dev(13, v, 2, 'd13-t14', 'DINHEIRO', cx);                        -- gerente de OUTRA loja repete a chave
  PERFORM pg_temp.assert((e = 'DEVOLVER_VENDA_SEM_PERMISSAO' OR e LIKE 'ACESSO_LOJA_NEGADO%'), 'T14 gerente de outra loja repetindo a chave → SEM_PERMISSAO (' || coalesce(e, 'aceita') || ')');
  e := pg_temp.dev(13, v, 2, 'd13-t14', 'DINHEIRO', cx, NULL, pg_temp.gid(12));   -- p_operador_id não vale com sessão
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_SEM_PERMISSAO' OR e LIKE 'ACESSO_LOJA_NEGADO%', 'T14 p_operador_id de gerente da loja é ignorado com sessão (' || coalesce(e, 'aceita') || ')');
  e := pg_temp.dev(12, v, 2, 'd13-t14', 'DINHEIRO', cx, pg_temp.op(41));           -- operador sem perfil gerencial
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_SEM_PERMISSAO' OR e LIKE 'ACESSO_LOJA_NEGADO%', 'T14 operador repetindo a chave → SEM_PERMISSAO (' || coalesce(e, 'aceita') || ')');

  -- Sem oráculo: caixa divergente informado por quem não tem permissão também é SEM_PERMISSAO (não RETRY_CAIXA_DIVERGENTE)
  e := pg_temp.dev(13, v, 2, 'd13-t14', 'DINHEIRO', cx2);
  PERFORM pg_temp.assert((e = 'DEVOLVER_VENDA_SEM_PERMISSAO' OR e LIKE 'ACESSO_LOJA_NEGADO%'), 'T14 caixa divergente por gerente de outra loja não vaza RETRY_CAIXA_DIVERGENTE (' || coalesce(e, 'aceita') || ')');
  e := pg_temp.dev(12, v, 2, 'd13-t14', 'DINHEIRO', cx2, pg_temp.op(42));
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_SEM_PERMISSAO' OR e LIKE 'ACESSO_LOJA_NEGADO%', 'T14 caixa divergente por operador não vaza RETRY_CAIXA_DIVERGENTE (' || coalesce(e, 'aceita') || ')');
  -- Quem tem permissão segue recebendo o erro explícito de caixa divergente
  e := pg_temp.dev(12, v, 2, 'd13-t14', 'DINHEIRO', cx2);
  PERFORM pg_temp.assert(e = 'DEVOLVER_VENDA_RETRY_CAIXA_DIVERGENTE', 'T14 gerente da loja com caixa divergente → RETRY_CAIXA_DIVERGENTE (' || coalesce(e, 'aceita') || ')');

  PERFORM pg_temp.assert(pg_temp.n_dev(v) = n1 AND pg_temp.auth(cx) = aut AND pg_temp.estoque(12) = est,
    'T14 nenhuma tentativa negada alterou operação, caixa ou estoque');
END $t14$;

-- ═══ Estrutura: exatamente UMA assinatura de devolver_ou_trocar_venda e ACL esperada ═══════════════════
DO $estrutura$
DECLARE r record;
BEGIN
  SELECT count(*) AS n, bool_and(NOT (p.proacl::text ~ '(^|[{,])=X/')) AS sem_public,
         bool_and(has_function_privilege('anon', p.oid, 'EXECUTE') = false) AS sem_anon,
         bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS com_auth,
         bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')) AS com_service,
         bool_and(pg_get_function_identity_arguments(p.oid) LIKE '%p_caixa_id uuid') AS tem_p_caixa_id
    INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'devolver_ou_trocar_venda';
  PERFORM pg_temp.assert(r.n = 1, 'estrutura: exatamente UMA assinatura de devolver_ou_trocar_venda (sem overload)');
  PERFORM pg_temp.assert(r.tem_p_caixa_id, 'estrutura: a assinatura vigente tem p_caixa_id');
  PERFORM pg_temp.assert(r.sem_public AND r.sem_anon, 'estrutura: PUBLIC e anon sem EXECUTE');
  PERFORM pg_temp.assert(r.com_auth AND r.com_service, 'estrutura: authenticated e service_role com EXECUTE');
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated', 'internal.valor_sistema_dinheiro(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'internal.resolver_caixa_pagador(uuid, uuid, text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'internal.sincronizar_saldo_cache(uuid)', 'EXECUTE'),
    'estrutura: funções internal.* do PR-2D não são executáveis por authenticated');
END $estrutura$;

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
  PERFORM pg_temp.assert(n >= 20, 'varredura cobriu ' || n || ' operações');

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
    SELECT 1 FROM public.caixas c WHERE c.status = 'ABERTO' AND c.operador_id IN (SELECT pg_temp.op(g) FROM generate_series(1, 60) g)
      AND c.operador_id <> pg_temp.op(16)   -- op 16: cache envenenado de propósito no T6
      AND c.saldo_atual <> internal.valor_sistema_dinheiro(c.id)),
    'A-6/A-8 cache saldo_atual = autoridade em todos os caixas abertos tocados');
END $varredura$;

DO $fim$ BEGIN RAISE NOTICE 'devolucao-d13-caixa-desembolso OK'; END $fim$;
ROLLBACK;
