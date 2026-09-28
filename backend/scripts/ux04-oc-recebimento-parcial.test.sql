-- UX-04 — Ordem de Compra com recebimento parcial (modelo B).
-- Regressão de 20260918100000_oc_recebimento_parcial.sql.
--
-- Cobre, por RPC real e contra o banco local:
--   total · parcial · segunda entrada · múltiplas entradas · saldo · encerramento com falta ·
--   acima do saldo · idempotência (replay/duplo clique) · duplicidade OC↔entrada (P0) ·
--   Kardex (+60, +40; nunca +100) · estoque · custo inalterado · NF-e + OC · entrada sem nota
--   com/sem OC · guardas de integridade · tenant/perfil.
-- Concorrência (duas sessões reais): ux04-oc-recebimento-concorrencia.sh.
--
-- Dados sintéticos, tudo em UMA transação com ROLLBACK.
--   docker exec -i supabase_db_fastproduct psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < backend/scripts/ux04-oc-recebimento-parcial.test.sql

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures e helpers (temporários)
-- ---------------------------------------------------------------------------

DO $setup$
DECLARE
  v_loja_a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_loja_b uuid := 'f4000001-0000-4000-8000-00000000000b';
BEGIN
  INSERT INTO auth.users (id) VALUES
    ('f4000002-0000-4000-8000-00000000000a'),
    ('f4000002-0000-4000-8000-00000000000b'),
    ('f4000002-0000-4000-8000-00000000000c')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES
    (v_loja_a, 'UX04 Loja A', 'UX04-A', true),
    (v_loja_b, 'UX04 Loja B', 'UX04-B', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    ('f4000002-0000-4000-8000-00000000000a', 'UX04 Gerente A', 'GERENTE', true, v_loja_a),
    ('f4000002-0000-4000-8000-00000000000b', 'UX04 Gerente B', 'GERENTE', true, v_loja_b),
    ('f4000002-0000-4000-8000-00000000000c', 'UX04 Operador A', 'OPERADOR', true, v_loja_a)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (id, nome) VALUES ('f4000003-0000-4000-8000-000000000001', 'UX04 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.fornecedores (id, cnpj, nome, loja_id)
  VALUES ('f4000005-0000-4000-8000-00000000000a', '11222333000181', 'UX04 Fornecedor', v_loja_a)
  ON CONFLICT (id) DO NOTHING;
END
$setup$;

CREATE FUNCTION pg_temp.as_user(p_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub', p_uid, true); END $$;

CREATE FUNCTION pg_temp.mk_prod(p_loja uuid, p_custo numeric DEFAULT 5) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, loja_id)
  VALUES (v, '789' || lpad((random() * 1e9)::bigint::text, 10, '0'), 'UX04 prod ' || v,
          'f4000003-0000-4000-8000-000000000001', 10.00, p_custo, 'china_manual', false, true, p_loja);
  RETURN v;
END $$;

-- itens: [{"produto_id": "...", "quantidade": 100}, ...]
CREATE FUNCTION pg_temp.mk_oc(p_loja uuid, p_status text, p_itens jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid := gen_random_uuid(); el jsonb;
BEGIN
  INSERT INTO public.ordens_compra (id, loja_id, fornecedor_id, status)
  VALUES (v, p_loja, 'f4000005-0000-4000-8000-00000000000a', p_status);
  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    INSERT INTO public.ordens_compra_itens (ordem_id, produto_id, descricao, quantidade, preco_unitario)
    VALUES (v, NULLIF(el->>'produto_id', '')::uuid, el->>'descricao', (el->>'quantidade')::numeric,
            COALESCE((el->>'preco')::numeric, 3.00));
  END LOOP;
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.item_de(p_oc uuid, p_prod uuid) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.ordens_compra_itens WHERE ordem_id = p_oc AND produto_id = p_prod ORDER BY created_at, id LIMIT 1 $$;

CREATE FUNCTION pg_temp.estoque_de(p_loja uuid, p_prod uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE((SELECT quantidade_atual FROM public.estoque WHERE loja_id = p_loja AND produto_id = p_prod), 0) $$;

CREATE FUNCTION pg_temp.recebido_de(p_oc uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE(SUM(quantidade_recebida), 0) FROM public.ordens_compra_itens WHERE ordem_id = p_oc $$;

CREATE FUNCTION pg_temp.status_de(p_oc uuid) RETURNS text LANGUAGE sql AS $$
  SELECT status FROM public.ordens_compra WHERE id = p_oc $$;

CREATE FUNCTION pg_temp.kardex_de(p_prod uuid, p_tipo text) RETURNS numeric[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg(quantidade_delta ORDER BY quantidade_delta), ARRAY[]::numeric[])
    FROM public.movimentos_estoque_log WHERE produto_id = p_prod AND tipo_codigo = p_tipo $$;

-- Executa `p_stmt` e exige que falhe com mensagem LIKE `p_padrao`.
CREATE FUNCTION pg_temp.esperar_erro(p_stmt text, p_padrao text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE p_padrao THEN
      RAISE EXCEPTION 'UX04_FALHOU: erro inesperado. Esperado LIKE %, recebido: %', p_padrao, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'UX04_FALHOU: era esperado erro LIKE % mas a operação foi aceita (%)', p_padrao, p_stmt;
END $$;

CREATE FUNCTION pg_temp.entrada(p_oc uuid, p_itens jsonb, p_key text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.receber_ordem_compra(p_oc, p_itens, p_key) $$;

CREATE FUNCTION pg_temp.iq(p_item uuid, p_q numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('item_id', p_item, 'quantidade_conferida', p_q) $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Recebimento TOTAL pelo próprio pedido
-- ═══════════════════════════════════════════════════════════════════════════
DO $t1$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a);
  v_oc uuid; v_it uuid; r jsonb;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 100)));
  v_it := pg_temp.item_de(v_oc, v_p);

  r := pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 100)), 'k-total');

  IF pg_temp.estoque_de(a, v_p) <> 100 THEN RAISE EXCEPTION 'T1: estoque esperado 100'; END IF;
  IF pg_temp.status_de(v_oc) <> 'RECEBIDA' THEN RAISE EXCEPTION 'T1: pedido deveria estar RECEBIDA'; END IF;
  IF (r->>'pendente_total')::numeric <> 0 OR (r->>'recebido_total')::numeric <> 100 THEN RAISE EXCEPTION 'T1: resumo %', r; END IF;
  IF (r->>'encerrada')::boolean IS NOT TRUE OR (r->>'encerrada_com_falta')::boolean THEN RAISE EXCEPTION 'T1: encerrada sem falta esperada'; END IF;
  IF pg_temp.kardex_de(v_p, 'ENTRADA_OC') <> ARRAY[100]::numeric[] THEN RAISE EXCEPTION 'T1: kardex'; END IF;
  RAISE NOTICE 'T1 OK — total: estoque 100, pedido RECEBIDA, kardex +100.';
END $t1$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) PARCIAL: 100 pedidos, 60 recebidos, 40 pendentes; pedido continua aberto
-- ═══════════════════════════════════════════════════════════════════════════
DO $t2$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a);
  v_oc uuid; v_it uuid; r jsonb;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 100)));
  v_it := pg_temp.item_de(v_oc, v_p);

  r := pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 60)), 'k-parcial');

  IF pg_temp.status_de(v_oc) <> 'EM_TRANSITO' THEN RAISE EXCEPTION 'T2: a 1ª entrada NÃO pode encerrar o pedido (status %)', pg_temp.status_de(v_oc); END IF;
  IF pg_temp.recebido_de(v_oc) <> 60 THEN RAISE EXCEPTION 'T2: recebido esperado 60'; END IF;
  IF (r->>'pendente_total')::numeric <> 40 OR (r->>'pedido_total')::numeric <> 100 THEN RAISE EXCEPTION 'T2: resumo %', r; END IF;
  IF (r->>'encerrada')::boolean THEN RAISE EXCEPTION 'T2: não deveria estar encerrada'; END IF;
  IF pg_temp.estoque_de(a, v_p) <> 60 THEN RAISE EXCEPTION 'T2: estoque esperado 60'; END IF;
  IF (SELECT status_conferencia FROM public.ordens_compra_itens WHERE id = v_it) <> 'EM_CONFERENCIA' THEN RAISE EXCEPTION 'T2: item deveria seguir aberto'; END IF;
  RAISE NOTICE 'T2 OK — parcial: 100/60/40, pedido segue EM_TRANSITO, estoque 60.';
END $t2$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) SEGUNDA ENTRADA e MÚLTIPLAS ENTRADAS; Kardex +60 +40 (nunca +100)
-- ═══════════════════════════════════════════════════════════════════════════
DO $t3$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a);
  v_oc uuid; v_it uuid; r jsonb;
  v_p2 uuid := pg_temp.mk_prod(a);
  v_oc2 uuid; v_it2 uuid;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');

  -- 60 + 40
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 100)));
  v_it := pg_temp.item_de(v_oc, v_p);
  PERFORM pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 60)), 'k-3a');
  r := pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 40)), 'k-3b');

  IF pg_temp.status_de(v_oc) <> 'RECEBIDA' THEN RAISE EXCEPTION 'T3: 2ª entrada zera o saldo => RECEBIDA'; END IF;
  IF pg_temp.recebido_de(v_oc) <> 100 OR (r->>'pendente_total')::numeric <> 0 THEN RAISE EXCEPTION 'T3: resumo %', r; END IF;
  IF pg_temp.estoque_de(a, v_p) <> 100 THEN RAISE EXCEPTION 'T3: estoque esperado 100 (não 160)'; END IF;
  IF pg_temp.kardex_de(v_p, 'ENTRADA_OC') <> ARRAY[40, 60]::numeric[] THEN
    RAISE EXCEPTION 'T3: kardex deve ter +60 e +40, recebido %', pg_temp.kardex_de(v_p, 'ENTRADA_OC');
  END IF;
  IF (SELECT count(*) FROM public.ordens_compra_recebimentos WHERE ordem_id = v_oc) <> 2 THEN RAISE EXCEPTION 'T3: razão deveria ter 2 linhas'; END IF;
  IF (SELECT count(DISTINCT entrada_id) FROM public.ordens_compra_recebimentos WHERE ordem_id = v_oc) <> 2 THEN RAISE EXCEPTION 'T3: 2 entradas distintas'; END IF;
  -- razão liga cada linha ao movimento do Kardex
  IF (SELECT count(*) FROM public.ordens_compra_recebimentos r2
        JOIN public.movimentos_estoque_log m ON m.id = r2.movimento_estoque_id AND m.quantidade_delta = r2.quantidade
       WHERE r2.ordem_id = v_oc) <> 2 THEN RAISE EXCEPTION 'T3: razão sem vínculo com o Kardex'; END IF;

  -- 30 + 30 + 40 (múltiplas)
  v_oc2 := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p2, 'quantidade', 100)));
  v_it2 := pg_temp.item_de(v_oc2, v_p2);
  PERFORM pg_temp.entrada(v_oc2, jsonb_build_array(pg_temp.iq(v_it2, 30)), 'k-3c');
  PERFORM pg_temp.entrada(v_oc2, jsonb_build_array(pg_temp.iq(v_it2, 30)), 'k-3d');
  IF pg_temp.status_de(v_oc2) <> 'EM_TRANSITO' OR pg_temp.recebido_de(v_oc2) <> 60 THEN RAISE EXCEPTION 'T3: após 30+30 segue aberto com 60'; END IF;
  PERFORM pg_temp.entrada(v_oc2, jsonb_build_array(pg_temp.iq(v_it2, 40)), 'k-3e');
  IF pg_temp.status_de(v_oc2) <> 'RECEBIDA' OR pg_temp.estoque_de(a, v_p2) <> 100 THEN RAISE EXCEPTION 'T3: 30+30+40 => RECEBIDA e estoque 100'; END IF;
  IF pg_temp.kardex_de(v_p2, 'ENTRADA_OC') <> ARRAY[30, 30, 40]::numeric[] THEN RAISE EXCEPTION 'T3: kardex 30/30/40'; END IF;
  RAISE NOTICE 'T3 OK — 60+40 e 30+30+40: estoque só recebe o conferido, kardex +60/+40, razão reconstrói o histórico.';
END $t3$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) ACIMA DO SALDO e DUPLICIDADE (P0): "receber tudo" depois de entrada parcial
-- ═══════════════════════════════════════════════════════════════════════════
DO $t4$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a);
  v_oc uuid; v_it uuid;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 100)));
  v_it := pg_temp.item_de(v_oc, v_p);
  PERFORM pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 60)), 'k-4a');

  -- P0: "receber OC" como se fossem 100 depois de já ter entrado 60
  PERFORM pg_temp.esperar_erro(
    format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 100)), %L)', v_oc, v_it, 'k-4b'),
    'OC_QTD_ACIMA_SALDO%');
  -- 1 unidade a mais que o saldo
  PERFORM pg_temp.esperar_erro(
    format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 40.001)), %L)', v_oc, v_it, 'k-4c'),
    'OC_QTD_ACIMA_SALDO%');

  IF pg_temp.estoque_de(a, v_p) <> 60 THEN RAISE EXCEPTION 'T4: estoque não pode mudar após tentativa recusada (%).', pg_temp.estoque_de(a, v_p); END IF;
  IF pg_temp.recebido_de(v_oc) <> 60 OR pg_temp.status_de(v_oc) <> 'EM_TRANSITO' THEN RAISE EXCEPTION 'T4: pedido não pode mudar'; END IF;
  IF pg_temp.kardex_de(v_p, 'ENTRADA_OC') <> ARRAY[60]::numeric[] THEN RAISE EXCEPTION 'T4: kardex intacto'; END IF;

  -- exatamente o saldo é aceito; depois disso o pedido está fechado
  PERFORM pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 40)), 'k-4d');
  PERFORM pg_temp.esperar_erro(
    format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 1)), %L)', v_oc, v_it, 'k-4e'),
    'OC_STATUS_INVALIDO%');
  RAISE NOTICE 'T4 OK — acima do saldo recusado (P0), estoque/kardex intactos; exatamente o saldo aceito; pedido fechado não recebe mais.';
END $t4$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) IDEMPOTÊNCIA: repetição/duplo clique não credita de novo
-- ═══════════════════════════════════════════════════════════════════════════
DO $t5$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a);
  v_oc uuid; v_it uuid; r1 jsonb; r2 jsonb;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 100)));
  v_it := pg_temp.item_de(v_oc, v_p);

  r1 := pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 60)), 'k-idem');
  r2 := pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 60)), 'k-idem');   -- replay

  IF (r1->>'replay')::boolean OR (r2->>'replay')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'T5: replay esperado só na 2ª chamada'; END IF;
  IF r1->>'entrada_id' <> r2->>'entrada_id' THEN RAISE EXCEPTION 'T5: replay deve devolver a mesma entrada'; END IF;
  IF pg_temp.estoque_de(a, v_p) <> 60 THEN RAISE EXCEPTION 'T5: replay creditou de novo (%)', pg_temp.estoque_de(a, v_p); END IF;
  IF pg_temp.kardex_de(v_p, 'ENTRADA_OC') <> ARRAY[60]::numeric[] THEN RAISE EXCEPTION 'T5: kardex duplicado'; END IF;
  IF (SELECT count(*) FROM public.ordens_compra_recebimentos WHERE ordem_id = v_oc) <> 1 THEN RAISE EXCEPTION 'T5: razão duplicado'; END IF;

  -- mesma chave, payload diferente => erro explícito (não sucesso silencioso)
  PERFORM pg_temp.esperar_erro(
    format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 30)), %L)', v_oc, v_it, 'k-idem'),
    'OC_IDEMPOTENCY_PAYLOAD_DIVERGENTE%');

  -- replay de uma entrada que FECHOU o pedido continua válido
  PERFORM pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 40)), 'k-idem-fecha');
  IF pg_temp.status_de(v_oc) <> 'RECEBIDA' THEN RAISE EXCEPTION 'T5: deveria ter fechado'; END IF;
  r2 := pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 40)), 'k-idem-fecha');
  IF (r2->>'replay')::boolean IS NOT TRUE OR pg_temp.estoque_de(a, v_p) <> 100 THEN RAISE EXCEPTION 'T5: replay pós-fechamento'; END IF;
  RAISE NOTICE 'T5 OK — replay devolve a mesma entrada, sem creditar; payload divergente recusado; replay pós-fechamento válido.';
END $t5$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) VALIDAÇÕES da entrada pelo pedido
-- ═══════════════════════════════════════════════════════════════════════════
DO $t6$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a);
  v_oc uuid; v_it uuid; v_oc_out uuid; v_it_out uuid; v_oc_r uuid;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 10)));
  v_it := pg_temp.item_de(v_oc, v_p);
  v_oc_out := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 10)));
  v_it_out := pg_temp.item_de(v_oc_out, v_p);

  -- entrada zerada (bug do modal): nenhum item > 0
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 0)), %L)', v_oc, v_it, 'k-6a'), 'OC_ENTRADA_VAZIA%');
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, -1)), %L)', v_oc, v_it, 'k-6b'), 'OC_QTD_INVALIDA%');
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 1.0005)), %L)', v_oc, v_it, 'k-6c'), 'OC_QTD_INVALIDA%');
  -- item de OUTRO pedido
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 1)), %L)', v_oc, v_it_out, 'k-6d'), 'OC_ITEM_NAO_ENCONTRADO%');
  -- item repetido no mesmo payload
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 1), pg_temp.iq(%L, 2)), %L)', v_oc, v_it, v_it, 'k-6e'), 'OC_ITEM_DUPLICADO%');
  -- lista vazia / chave vazia
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, %L::jsonb, %L)', v_oc, '[]', 'k-6f'), 'OC_ITENS_INVALIDOS%');
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 1)), %L)', v_oc, v_it, '  '), 'OC_IDEMPOTENCY_KEY%');
  -- pedido em RASCUNHO / CANCELADA não recebe
  v_oc_r := pg_temp.mk_oc(a, 'RASCUNHO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 10)));
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 1)), %L)', v_oc_r, pg_temp.item_de(v_oc_r, v_p), 'k-6g'), 'OC_STATUS_INVALIDO%');

  IF pg_temp.estoque_de(a, v_p) <> 0 THEN RAISE EXCEPTION 'T6: nenhuma tentativa inválida pode creditar estoque'; END IF;

  -- CONFIRMADA recebe e é promovida a EM_TRANSITO (a mercadoria chegou)
  DECLARE v_oc_c uuid := pg_temp.mk_oc(a, 'CONFIRMADA', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 10)));
  BEGIN
    PERFORM pg_temp.entrada(v_oc_c, jsonb_build_array(pg_temp.iq(pg_temp.item_de(v_oc_c, v_p), 4)), 'k-6h');
    IF pg_temp.status_de(v_oc_c) <> 'EM_TRANSITO' THEN RAISE EXCEPTION 'T6: CONFIRMADA com recebimento parcial => EM_TRANSITO'; END IF;
  END;
  RAISE NOTICE 'T6 OK — entrada zerada/negativa/fracionada, item alheio/duplicado, chave vazia e status inválido recusados sem tocar estoque.';
END $t6$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) ENCERRAMENTO COM FALTA
-- ═══════════════════════════════════════════════════════════════════════════
DO $t7$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a);
  v_oc uuid; v_it uuid; r jsonb; v_zero uuid;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 100)));
  v_it := pg_temp.item_de(v_oc, v_p);
  PERFORM pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 60)), 'k-7a');

  PERFORM pg_temp.esperar_erro(format('SELECT public.encerrar_ordem_compra_com_falta(%L, %L)', v_oc, 'abc'), 'OC_MOTIVO_OBRIGATORIO%');
  PERFORM pg_temp.esperar_erro(format('SELECT public.encerrar_ordem_compra_com_falta(%L, %L)', v_oc, '   '), 'OC_MOTIVO_OBRIGATORIO%');

  r := public.encerrar_ordem_compra_com_falta(v_oc, 'Fornecedor informou que não entrega o restante');

  IF pg_temp.status_de(v_oc) <> 'RECEBIDA' THEN RAISE EXCEPTION 'T7: encerrada => RECEBIDA (sem novo status)'; END IF;
  IF pg_temp.recebido_de(v_oc) <> 60 OR pg_temp.estoque_de(a, v_p) <> 60 THEN RAISE EXCEPTION 'T7: encerrar não pode mexer no recebido nem no estoque'; END IF;
  IF (r->>'encerrada_com_falta')::boolean IS NOT TRUE OR (r->>'pendente_total')::numeric <> 40 THEN RAISE EXCEPTION 'T7: resumo %', r; END IF;
  IF (SELECT encerrada_com_falta_por FROM public.ordens_compra WHERE id = v_oc) IS DISTINCT FROM 'f4000002-0000-4000-8000-00000000000a'::uuid
     OR (SELECT encerrada_com_falta_em FROM public.ordens_compra WHERE id = v_oc) IS NULL
     OR (SELECT encerramento_motivo FROM public.ordens_compra WHERE id = v_oc) NOT LIKE 'Fornecedor informou%' THEN
    RAISE EXCEPTION 'T7: auditoria (quem/quando/motivo) não gravada';
  END IF;
  IF (SELECT status_conferencia FROM public.ordens_compra_itens WHERE id = v_it) <> 'DIVERGENTE' THEN RAISE EXCEPTION 'T7: item com falta => DIVERGENTE'; END IF;

  -- depois de encerrada: não recebe mais, não encerra de novo
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 1)), %L)', v_oc, v_it, 'k-7b'), 'OC_STATUS_INVALIDO%');
  PERFORM pg_temp.esperar_erro(format('SELECT public.encerrar_ordem_compra_com_falta(%L, %L)', v_oc, 'motivo qualquer'), 'OC_STATUS_INVALIDO%');

  -- sem nada recebido o caminho é Cancelar, não "encerrar com falta"
  v_zero := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 5)));
  PERFORM pg_temp.esperar_erro(format('SELECT public.encerrar_ordem_compra_com_falta(%L, %L)', v_zero, 'motivo qualquer'), 'OC_SEM_RECEBIMENTO%');
  RAISE NOTICE 'T7 OK — encerramento com falta: RECEBIDA + auditoria, recebido/estoque intactos, sem novo status, exige recebimento prévio e motivo.';
END $t7$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) GUARDAS DE INTEGRIDADE do banco
-- ═══════════════════════════════════════════════════════════════════════════
DO $t8$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a);
  v_oc uuid; v_it uuid; v_oc2 uuid;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 100)));
  v_it := pg_temp.item_de(v_oc, v_p);
  v_oc2 := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 10)));

  -- sem marca de RPC: UPDATE direto de status/recebido é recusado
  PERFORM set_config('jinlong.oc_writer', 'off', true);
  PERFORM pg_temp.esperar_erro(format('UPDATE public.ordens_compra SET status = %L WHERE id = %L', 'RECEBIDA', v_oc2), 'OC_RECEBIDA_SOMENTE_VIA_RPC%');
  PERFORM pg_temp.esperar_erro(format('UPDATE public.ordens_compra_itens SET quantidade_recebida = 5 WHERE id = %L', v_it), 'OC_RECEBIDO_SOMENTE_VIA_RPC%');

  -- cancelar SEM recebimento continua permitido
  UPDATE public.ordens_compra SET status = 'CANCELADA' WHERE id = v_oc2;
  IF pg_temp.status_de(v_oc2) <> 'CANCELADA' THEN RAISE EXCEPTION 'T8: cancelar sem recebimento deve continuar funcionando'; END IF;

  -- cancelar COM recebimento é recusado (o caminho é encerrar com falta)
  PERFORM pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 10)), 'k-8a');
  PERFORM set_config('jinlong.oc_writer', 'off', true);
  PERFORM pg_temp.esperar_erro(format('UPDATE public.ordens_compra SET status = %L WHERE id = %L', 'CANCELADA', v_oc), 'OC_CANCELAR_COM_RECEBIMENTO%');

  -- razão append-only e itens com histórico não podem ser apagados
  PERFORM pg_temp.esperar_erro(format('UPDATE public.ordens_compra_recebimentos SET quantidade = 1 WHERE ordem_id = %L', v_oc), 'OC_RECEBIMENTO_IMUTAVEL%');
  PERFORM pg_temp.esperar_erro(format('DELETE FROM public.ordens_compra_recebimentos WHERE ordem_id = %L', v_oc), 'OC_RECEBIMENTO_IMUTAVEL%');
  PERFORM pg_temp.esperar_erro(format('DELETE FROM public.ordens_compra_itens WHERE ordem_id = %L', v_oc), '%violates foreign key constraint%');
  RAISE NOTICE 'T8 OK — status/recebido só via RPC; cancelar com recebimento recusado; razão imutável; item com histórico não é apagado.';
END $t8$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9) ENTRADA SEM NF-e vinculada à OC (e regressão sem OC)
-- ═══════════════════════════════════════════════════════════════════════════
DO $t9$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  b uuid := 'f4000001-0000-4000-8000-00000000000b';
  v_p uuid := pg_temp.mk_prod(a);
  v_q uuid := pg_temp.mk_prod(a);
  v_oc uuid; v_it uuid; v_id uuid; v_id2 uuid; v_ocb uuid; v_pb uuid := pg_temp.mk_prod(b);
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 100)));
  v_it := pg_temp.item_de(v_oc, v_p);

  -- 60 sem nota, vinculados: abate o saldo, NÃO fecha o pedido
  v_id := public.criar_confirmar_remessa_entrada(
    'Entrega parcial', 'obs', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade_esperada', 60, 'quantidade_conferida', 60)),
    'k-9a', v_oc);
  IF pg_temp.recebido_de(v_oc) <> 60 OR pg_temp.status_de(v_oc) <> 'EM_TRANSITO' THEN RAISE EXCEPTION 'T9: manual 60 => recebido 60, pedido aberto'; END IF;
  IF pg_temp.estoque_de(a, v_p) <> 60 THEN RAISE EXCEPTION 'T9: estoque 60'; END IF;
  IF (SELECT origem_tipo || '/' || origem_ref FROM public.remessas WHERE id = v_id) <> 'ORDEM_COMPRA/' || v_oc::text THEN RAISE EXCEPTION 'T9: origem da remessa'; END IF;
  IF (SELECT count(*) FROM public.ordens_compra_recebimentos WHERE remessa_id = v_id AND origem = 'REMESSA' AND ordem_id = v_oc AND quantidade = 60 AND entrada_id = v_id) <> 1 THEN
    RAISE EXCEPTION 'T9: razão deve ligar a remessa ao pedido por item';
  END IF;
  IF (SELECT observacao FROM public.movimentos_estoque_log WHERE remessa_id = v_id) NOT LIKE '%OC ' || v_oc::text || '%' THEN RAISE EXCEPTION 'T9: kardex deve exibir a origem OC'; END IF;

  -- replay idempotente COM OC (mesmo hash) e divergência de OC na mesma chave
  v_id2 := public.criar_confirmar_remessa_entrada(
    'Entrega parcial', 'obs', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade_esperada', 60, 'quantidade_conferida', 60)),
    'k-9a', v_oc);
  IF v_id2 <> v_id OR pg_temp.estoque_de(a, v_p) <> 60 THEN RAISE EXCEPTION 'T9: replay não pode duplicar'; END IF;
  PERFORM pg_temp.esperar_erro(format($f$SELECT public.criar_confirmar_remessa_entrada('Entrega parcial', 'obs', %L::jsonb, 'k-9a', NULL)$f$,
    jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade_esperada', 60, 'quantidade_conferida', 60))),
    'REMESSA_IDEMPOTENCY_PAYLOAD_DIVERGENTE%');

  -- P0 do briefing: 60 já entraram; "receber OC" como 100 é recusado
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 100)), %L)', v_oc, v_it, 'k-9b'), 'OC_QTD_ACIMA_SALDO%');
  -- acima do saldo pela própria entrada sem nota
  PERFORM pg_temp.esperar_erro(format($f$SELECT public.criar_confirmar_remessa_entrada('x', NULL, %L::jsonb, 'k-9c', %L)$f$,
    jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade_esperada', 41, 'quantidade_conferida', 41)), v_oc), 'OC_QTD_ACIMA_SALDO%');
  IF pg_temp.estoque_de(a, v_p) <> 60 THEN RAISE EXCEPTION 'T9: tentativa recusada não pode alterar estoque'; END IF;
  -- produto que não está no pedido
  PERFORM pg_temp.esperar_erro(format($f$SELECT public.criar_confirmar_remessa_entrada('x', NULL, %L::jsonb, 'k-9d', %L)$f$,
    jsonb_build_array(jsonb_build_object('produto_id', v_q, 'quantidade_esperada', 1, 'quantidade_conferida', 1)), v_oc), 'OC_PRODUTO_FORA_DO_PEDIDO%');

  -- os 40 restantes fecham o pedido; o pedido receberia por qualquer via
  PERFORM public.criar_confirmar_remessa_entrada('Resto', NULL,
    jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade_esperada', 40, 'quantidade_conferida', 40)), 'k-9e', v_oc);
  IF pg_temp.status_de(v_oc) <> 'RECEBIDA' OR pg_temp.estoque_de(a, v_p) <> 100 THEN RAISE EXCEPTION 'T9: 60+40 => RECEBIDA, estoque 100'; END IF;
  IF pg_temp.kardex_de(v_p, 'ENTRADA_REMessa_LOJA') <> ARRAY[40, 60]::numeric[] THEN RAISE EXCEPTION 'T9: kardex +60 +40'; END IF;
  -- pedido fechado recusa novo vínculo
  PERFORM pg_temp.esperar_erro(format($f$SELECT public.criar_confirmar_remessa_entrada('x', NULL, %L::jsonb, 'k-9f', %L)$f$,
    jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade_esperada', 1, 'quantidade_conferida', 1)), v_oc), 'OC_STATUS_INVALIDO%');

  -- outra loja: recusado
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000b');
  v_ocb := pg_temp.mk_oc(b, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_pb, 'quantidade', 10)));
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  PERFORM pg_temp.esperar_erro(format($f$SELECT public.criar_confirmar_remessa_entrada('x', NULL, %L::jsonb, 'k-9g', %L)$f$,
    jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade_esperada', 1, 'quantidade_conferida', 1)), v_ocb), 'OC_LOJA%');
  RAISE NOTICE 'T9 OK — entrada sem nota + OC: abate por item, kardex +60/+40, idempotente, recusa acima do saldo/produto alheio/pedido fechado/outra loja.';
END $t9$;

DO $t9b$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a);
  v_id uuid;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  -- REGRESSÃO: sem OC (chamada de 4 argumentos) funciona exatamente como antes
  v_id := public.criar_confirmar_remessa_entrada(
    'Sem documento', 'sem oc', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade_esperada', 7, 'quantidade_conferida', 7)), 'k-9h');
  IF pg_temp.estoque_de(a, v_p) <> 7 THEN RAISE EXCEPTION 'T9b: estoque'; END IF;
  IF (SELECT origem_tipo FROM public.remessas WHERE id = v_id) <> 'SEM_DOCUMENTO' THEN RAISE EXCEPTION 'T9b: origem SEM_DOCUMENTO'; END IF;
  IF (SELECT count(*) FROM public.ordens_compra_recebimentos WHERE remessa_id = v_id) <> 0 THEN RAISE EXCEPTION 'T9b: sem OC não há razão'; END IF;
  IF (SELECT observacao FROM public.movimentos_estoque_log WHERE remessa_id = v_id) <> 'sem oc' THEN RAISE EXCEPTION 'T9b: observação inalterada sem OC'; END IF;
  -- payload_hash sem OC é o mesmo cálculo anterior (replay legado não diverge)
  IF (SELECT payload_hash FROM public.remessas WHERE id = v_id) <> md5(jsonb_build_object(
        'origem', 'Sem documento', 'observacao', 'sem oc',
        'itens', jsonb_build_array(jsonb_build_object('produto_id', v_p::text, 'quantidade_esperada', '7', 'quantidade_conferida', '7')))::text) THEN
    RAISE EXCEPTION 'T9b: hash sem OC mudou (quebraria replays antigos)';
  END IF;
  -- custo intacto
  IF (SELECT preco_custo FROM public.produtos WHERE id = v_p) <> 5 THEN RAISE EXCEPTION 'T9b: entrada sem nota não pode alterar custo'; END IF;
  RAISE NOTICE 'T9b OK — regressão: entrada sem OC idêntica ao comportamento anterior (4 args, hash, observação, custo).';
END $t9b$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10) NF-e + OC (vínculo escolhido pelo operador; custo e contas a pagar como antes)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE FUNCTION pg_temp.mk_nfe(p_loja uuid, p_itens jsonb, p_parcelas numeric DEFAULT 90) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid := gen_random_uuid(); el jsonb;
BEGIN
  INSERT INTO public.importacoes_nfe (id, chave_acesso, numero_nf, fornecedor_id, loja_id, usuario_id, status)
  VALUES (v, 'UX04' || replace(v::text, '-', ''), '1234', 'f4000005-0000-4000-8000-00000000000a', p_loja,
          'f4000002-0000-4000-8000-00000000000a', 'EM_CONFERENCIA');
  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    INSERT INTO public.importacoes_nfe_itens (importacao_nfe_id, produto_id, quantidade_nfe, custo_unitario, atualizar_custo, quantidade_conferida, status_conferencia)
    VALUES (v, (el->>'produto_id')::uuid, (el->>'quantidade')::numeric, COALESCE((el->>'custo')::numeric, 6),
            true, (el->>'conferida')::numeric, 'CONFERIDO');
  END LOOP;
  INSERT INTO public.importacoes_nfe_duplicatas (importacao_nfe_id, numero_duplicata, data_vencimento, valor)
  VALUES (v, '001', current_date + 30, p_parcelas);
  RETURN v;
END $$;

DO $t10$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a, 5);
  v_extra uuid := pg_temp.mk_prod(a, 5);
  v_oc uuid; v_it uuid; v_n1 uuid; v_n2 uuid; v_n3 uuid; v_oc_r uuid;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 100)));
  v_it := pg_temp.item_de(v_oc, v_p);

  -- NF #1: 60 do pedido + 5 de um produto que NÃO está no pedido
  v_n1 := pg_temp.mk_nfe(a, jsonb_build_array(
            jsonb_build_object('produto_id', v_p, 'quantidade', 60, 'conferida', 60, 'custo', 6),
            jsonb_build_object('produto_id', v_extra, 'quantidade', 5, 'conferida', 5, 'custo', 6)));
  PERFORM public.vincular_importacao_nfe_ordem_compra(v_n1, v_oc);
  PERFORM public.confirmar_importacao_nfe(v_n1);

  IF pg_temp.estoque_de(a, v_p) <> 60 OR pg_temp.estoque_de(a, v_extra) <> 5 THEN RAISE EXCEPTION 'T10: estoque NF-e (60 e 5)'; END IF;
  IF pg_temp.recebido_de(v_oc) <> 60 OR pg_temp.status_de(v_oc) <> 'EM_TRANSITO' THEN RAISE EXCEPTION 'T10: NF 60 => pedido aberto com 60 (extra não atribuído)'; END IF;
  IF (SELECT status FROM public.importacoes_nfe WHERE id = v_n1) <> 'CONCLUIDA' THEN RAISE EXCEPTION 'T10: importação concluída'; END IF;
  -- custo: regra existente preservada (NF-e atualiza)
  IF (SELECT preco_custo FROM public.produtos WHERE id = v_p) <> 6 THEN RAISE EXCEPTION 'T10: NF-e deve atualizar custo (regra existente)'; END IF;
  -- contas a pagar: regra existente preservada
  IF (SELECT count(*) FROM public.contas_pagar WHERE nfe_importacao_id = v_n1) <> 1 THEN RAISE EXCEPTION 'T10: NF-e deve gerar conta a pagar'; END IF;
  -- razão liga a NF ao pedido por item; kardex exibe a origem
  IF (SELECT count(*) FROM public.ordens_compra_recebimentos WHERE importacao_nfe_id = v_n1 AND origem = 'NFE' AND ordem_item_id = v_it AND quantidade = 60 AND entrada_id = v_n1) <> 1 THEN
    RAISE EXCEPTION 'T10: razão NF-e→pedido';
  END IF;
  IF (SELECT count(*) FROM public.ordens_compra_recebimentos WHERE importacao_nfe_id = v_n1) <> 1 THEN RAISE EXCEPTION 'T10: item fora do pedido não pode entrar no razão'; END IF;
  IF pg_temp.kardex_de(v_p, 'ENTRADA_NFE') <> ARRAY[60]::numeric[] THEN RAISE EXCEPTION 'T10: kardex NF +60'; END IF;
  IF (SELECT observacao FROM public.movimentos_estoque_log WHERE produto_id = v_p AND tipo_codigo = 'ENTRADA_NFE') NOT LIKE '%OC ' || v_oc::text THEN RAISE EXCEPTION 'T10: kardex exibe origem OC'; END IF;

  -- NF #2 acima do saldo (41 > 40): a confirmação inteira aborta, nada é creditado
  v_n2 := pg_temp.mk_nfe(a, jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 41, 'conferida', 41, 'custo', 7)));
  PERFORM public.vincular_importacao_nfe_ordem_compra(v_n2, v_oc);
  PERFORM pg_temp.esperar_erro(format('SELECT public.confirmar_importacao_nfe(%L)', v_n2), 'OC_QTD_ACIMA_SALDO%');
  IF pg_temp.estoque_de(a, v_p) <> 60 THEN RAISE EXCEPTION 'T10: confirmação abortada não pode creditar'; END IF;
  IF (SELECT status FROM public.importacoes_nfe WHERE id = v_n2) <> 'EM_CONFERENCIA' THEN RAISE EXCEPTION 'T10: importação deve seguir em conferência'; END IF;
  IF (SELECT count(*) FROM public.contas_pagar WHERE nfe_importacao_id = v_n2) <> 0 THEN RAISE EXCEPTION 'T10: sem conta a pagar na confirmação abortada'; END IF;
  IF (SELECT preco_custo FROM public.produtos WHERE id = v_p) <> 6 THEN RAISE EXCEPTION 'T10: custo não pode mudar na confirmação abortada'; END IF;
  -- operador desvincula o pedido e confirma (a NF é um fato físico/fiscal)
  PERFORM public.vincular_importacao_nfe_ordem_compra(v_n2, NULL);
  PERFORM public.confirmar_importacao_nfe(v_n2);
  IF pg_temp.estoque_de(a, v_p) <> 101 OR pg_temp.recebido_de(v_oc) <> 60 THEN RAISE EXCEPTION 'T10: desvinculada credita estoque sem tocar o pedido'; END IF;

  -- NF #3: fecha o saldo (40) => pedido RECEBIDA
  v_n3 := pg_temp.mk_nfe(a, jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 40, 'conferida', 40, 'custo', 6)));
  PERFORM public.vincular_importacao_nfe_ordem_compra(v_n3, v_oc);
  PERFORM public.confirmar_importacao_nfe(v_n3);
  IF pg_temp.status_de(v_oc) <> 'RECEBIDA' OR pg_temp.recebido_de(v_oc) <> 100 THEN RAISE EXCEPTION 'T10: 60+40 por NF-e => RECEBIDA'; END IF;

  -- vínculo: pedido fechado recusado; NF já concluída não aceita vínculo; outra loja recusada
  v_oc_r := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 1)));
  PERFORM pg_temp.esperar_erro(format('SELECT public.vincular_importacao_nfe_ordem_compra(%L, %L)', v_n1, v_oc_r), 'IMPORT_NFE_STATUS_INVALIDO%');
  DECLARE v_n4 uuid := pg_temp.mk_nfe(a, jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 1, 'conferida', 1)));
  BEGIN
    PERFORM pg_temp.esperar_erro(format('SELECT public.vincular_importacao_nfe_ordem_compra(%L, %L)', v_n4, v_oc), 'OC_STATUS_INVALIDO%');
  END;
  RAISE NOTICE 'T10 OK — NF-e + OC: abate por item, extra fora do pedido não atribuído, acima do saldo aborta tudo, custo e contas a pagar como antes.';
END $t10$;

DO $t10b$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a, 5);
  v_n uuid;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  -- REGRESSÃO: NF-e sem pedido segue idêntica (estoque + custo + conta a pagar; sem razão)
  v_n := pg_temp.mk_nfe(a, jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 12, 'conferida', 10, 'custo', 8)));
  PERFORM public.confirmar_importacao_nfe(v_n);
  IF pg_temp.estoque_de(a, v_p) <> 10 THEN RAISE EXCEPTION 'T10b: estoque = conferida (10)'; END IF;
  IF (SELECT preco_custo FROM public.produtos WHERE id = v_p) <> 8 THEN RAISE EXCEPTION 'T10b: custo atualizado'; END IF;
  IF (SELECT count(*) FROM public.contas_pagar WHERE nfe_importacao_id = v_n) <> 1 THEN RAISE EXCEPTION 'T10b: conta a pagar'; END IF;
  IF (SELECT count(*) FROM public.ordens_compra_recebimentos WHERE importacao_nfe_id = v_n) <> 0 THEN RAISE EXCEPTION 'T10b: sem pedido não há razão'; END IF;
  IF (SELECT observacao FROM public.movimentos_estoque_log WHERE produto_id = v_p AND tipo_codigo = 'ENTRADA_NFE') LIKE '%OC%' THEN RAISE EXCEPTION 'T10b: kardex sem OC'; END IF;
  PERFORM pg_temp.esperar_erro(format('SELECT public.confirmar_importacao_nfe(%L)', v_n), 'IMPORT_NFE_STATUS_INVALIDO%');
  RAISE NOTICE 'T10b OK — regressão: NF-e sem pedido inalterada; segunda confirmação recusada.';
END $t10b$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11) CUSTO: entrada pelo pedido não altera custo; item sem produto; múltiplas linhas do mesmo produto
-- ═══════════════════════════════════════════════════════════════════════════
DO $t11$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a, 5);
  v_oc uuid; v_it uuid; v_it_livre uuid; v_oc2 uuid;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(
            jsonb_build_object('produto_id', v_p, 'quantidade', 10, 'preco', 99),
            jsonb_build_object('descricao', 'Item sem cadastro', 'quantidade', 3)));
  v_it := pg_temp.item_de(v_oc, v_p);
  SELECT id INTO v_it_livre FROM public.ordens_compra_itens WHERE ordem_id = v_oc AND produto_id IS NULL;

  PERFORM pg_temp.entrada(v_oc, jsonb_build_array(pg_temp.iq(v_it, 10), pg_temp.iq(v_it_livre, 3)), 'k-11a');
  IF (SELECT preco_custo FROM public.produtos WHERE id = v_p) <> 5 THEN RAISE EXCEPTION 'T11: preço do pedido (99) NÃO pode virar custo'; END IF;
  IF pg_temp.status_de(v_oc) <> 'RECEBIDA' THEN RAISE EXCEPTION 'T11: item sem produto também fecha o pedido'; END IF;
  IF (SELECT count(*) FROM public.ordens_compra_recebimentos WHERE ordem_item_id = v_it_livre AND movimento_estoque_id IS NULL AND quantidade = 3) <> 1 THEN RAISE EXCEPTION 'T11: item sem produto: razão sem movimento'; END IF;
  IF (SELECT count(*) FROM public.movimentos_estoque_log WHERE produto_id = v_p) <> 1 THEN RAISE EXCEPTION 'T11: só o item com produto gera kardex'; END IF;

  -- mesmo produto em duas linhas: a entrada é distribuída pelas linhas (a ordem entre linhas criadas
  -- no mesmo INSERT é determinística por id, não por "criação"; o invariante é soma e teto por linha)
  v_oc2 := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(
            jsonb_build_object('produto_id', v_p, 'quantidade', 10),
            jsonb_build_object('produto_id', v_p, 'quantidade', 5)));
  PERFORM public.criar_confirmar_remessa_entrada('duas linhas', NULL,
    jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade_esperada', 12, 'quantidade_conferida', 12)), 'k-11b', v_oc2);
  IF (SELECT sum(quantidade_recebida) FROM public.ordens_compra_itens WHERE ordem_id = v_oc2) <> 12
     OR EXISTS (SELECT 1 FROM public.ordens_compra_itens WHERE ordem_id = v_oc2 AND quantidade_recebida > quantidade) THEN
    RAISE EXCEPTION 'T11: 12 unidades devem ser distribuídas sem passar do pedido de cada linha (%)',
      (SELECT array_agg(quantidade_recebida ORDER BY id) FROM public.ordens_compra_itens WHERE ordem_id = v_oc2);
  END IF;
  IF (SELECT count(*) FROM public.ordens_compra_recebimentos WHERE ordem_id = v_oc2) NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION 'T11: razão deve registrar 1 ou 2 linhas para a entrada';
  END IF;
  RAISE NOTICE 'T11 OK — custo do pedido nunca vira custo; item sem produto sem kardex; mesmo produto em 2 linhas é distribuído sem estourar o pedido.';
END $t11$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12) PERFIL, TENANT e GRANTS
-- ═══════════════════════════════════════════════════════════════════════════
DO $t12$
DECLARE
  a uuid := 'f4000001-0000-4000-8000-00000000000a';
  v_p uuid := pg_temp.mk_prod(a);
  v_oc uuid; v_it uuid;
BEGIN
  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000a');
  v_oc := pg_temp.mk_oc(a, 'EM_TRANSITO', jsonb_build_array(jsonb_build_object('produto_id', v_p, 'quantidade', 10)));
  v_it := pg_temp.item_de(v_oc, v_p);

  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000c');   -- OPERADOR
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 1)), %L)', v_oc, v_it, 'k-12a'), 'OC_PERFIL%');
  PERFORM pg_temp.esperar_erro(format('SELECT public.encerrar_ordem_compra_com_falta(%L, %L)', v_oc, 'motivo qualquer'), 'OC_PERFIL%');

  PERFORM pg_temp.as_user('f4000002-0000-4000-8000-00000000000b');   -- GERENTE de OUTRA loja
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 1)), %L)', v_oc, v_it, 'k-12b'), 'OC_LOJA%');
  PERFORM pg_temp.esperar_erro(format('SELECT public.encerrar_ordem_compra_com_falta(%L, %L)', v_oc, 'motivo qualquer'), 'OC_LOJA%');

  PERFORM set_config('request.jwt.claim.sub', '', true);              -- sem autenticação
  PERFORM pg_temp.esperar_erro(format('SELECT pg_temp.entrada(%L, jsonb_build_array(pg_temp.iq(%L, 1)), %L)', v_oc, v_it, 'k-12c'), 'OC_AUTH%');

  IF pg_temp.estoque_de(a, v_p) <> 0 THEN RAISE EXCEPTION 'T12: nenhuma tentativa não autorizada pode creditar'; END IF;
  IF has_function_privilege('anon', 'public.receber_ordem_compra(uuid,jsonb,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.encerrar_ordem_compra_com_falta(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.criar_confirmar_remessa_entrada(text,text,jsonb,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.vincular_importacao_nfe_ordem_compra(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T12: anon não pode executar as RPCs';
  END IF;
  IF has_function_privilege('authenticated', 'public._oc_abater_por_produto(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,numeric,numeric,uuid,text,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._oc_atualizar_estado(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T12: helpers internos não podem ser executáveis por authenticated';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.receber_ordem_compra(uuid,jsonb,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T12: authenticated precisa executar receber_ordem_compra';
  END IF;
  RAISE NOTICE 'T12 OK — OPERADOR/outra loja/sem auth recusados; anon sem acesso; helpers não expostos.';
END $t12$;

ROLLBACK;
