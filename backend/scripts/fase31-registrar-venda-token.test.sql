-- FASE 3.1 — venda offline com token de gerente: wrapper transacional (proposta em
-- backend/scripts/fase31-propostas/registrar_venda_offline_com_token.sql). Termina com ROLLBACK.
--
-- Execução (propostas na mesma transação):
--   cat backend/scripts/fase31-propostas/token_desconto_consumo_unico_offline.sql \
--       backend/scripts/fase31-propostas/registrar_venda_offline_com_token.sql \
--       backend/scripts/fase31-registrar-venda-token.test.sql | \
--     docker exec -i supabase_db_fastproduct psql -U postgres -d postgres -v ON_ERROR_STOP=1

BEGIN;

CREATE TEMP TABLE rv_res (caso text PRIMARY KEY, ok boolean, detalhe text) ON COMMIT DROP;

DO $$
DECLARE
  v_caixa uuid; v_loja uuid; v_oper uuid; v_ger uuid; v_prod uuid; v_preco numeric; v_forma text;
  v_itens jsonb; t record; v_pct numeric := 10;
  v_venda1 uuid := gen_random_uuid(); v_venda2 uuid := gen_random_uuid(); v_venda3 uuid := gen_random_uuid();
  v_tok text := 'RV-' || substr(md5(random()::text), 1, 12);
  v_tok2 text := 'RV-' || substr(md5(random()::text), 1, 12);
  v_erro text; v_usado boolean; v_n int;
BEGIN
  -- Caixa aberto com operador, e loja dele.
  SELECT c.id, c.loja_id, c.operador_id INTO v_caixa, v_loja, v_oper
    FROM public.caixas c WHERE c.status = 'ABERTO' AND c.operador_id IS NOT NULL ORDER BY c.id LIMIT 1;
  IF v_caixa IS NULL THEN RAISE EXCEPTION 'PRECONDICAO: sem caixa aberto no banco de teste'; END IF;

  -- Gerente/DONO com vínculo ativo na loja (aprovador válido para o trigger).
  SELECT v.usuario_id INTO v_ger FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id
   WHERE v.loja_id = v_loja AND v.ativo AND u.ativo AND u.perfil IN ('DONO', 'GERENTE')
   ORDER BY v.usuario_id LIMIT 1;
  IF v_ger IS NULL THEN RAISE EXCEPTION 'PRECONDICAO: sem gerente ativo na loja do caixa'; END IF;

  -- Produto ativo, com preço e estoque na loja.
  SELECT p.id, p.preco_varejo INTO v_prod, v_preco
    FROM public.produtos p JOIN public.estoque e ON e.produto_id = p.id AND e.loja_id = v_loja
   WHERE p.ativo AND p.loja_id = v_loja AND p.preco_varejo > 0 AND e.quantidade_atual >= 5
   ORDER BY p.id LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'PRECONDICAO: sem produto com estoque na loja do caixa'; END IF;

  -- Desconto de gerente exige pagamento em dinheiro (DESCONTO_GERENTE_EXIGE_PAGAMENTO_DINHEIRO).
  SELECT f.codigo INTO v_forma FROM public.formas_pagamento f WHERE f.loja_id = v_loja AND f.ativo AND f.codigo = 'DINHEIRO' LIMIT 1;
  IF v_forma IS NULL THEN RAISE EXCEPTION 'PRECONDICAO: sem forma de pagamento ativa na loja'; END IF;

  v_itens := jsonb_build_array(jsonb_build_object(
    'item_id', gen_random_uuid(), 'produto_id', v_prod, 'quantidade', 1,
    'preco_original', v_preco, 'preco_unitario', v_preco));

  SELECT * INTO t FROM internal.calcular_totais_venda(v_itens, v_pct);

  -- Token de dispositivo: emissor NULL, aprovador = gerente ativo da loja.
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por, aprovador_id)
  VALUES (v_tok, now() + interval '1 hour', false, v_loja::text, NULL, v_ger);

  -- R1: venda com desconto de gerente autorizada por token é gravada e o token é consumido.
  v_erro := NULL;
  BEGIN
    PERFORM public.registrar_venda_offline_com_token(v_tok, v_loja, false, v_venda1, v_caixa, v_oper, v_forma,
      t.total_bruto, t.total_desconto, t.total_liquido, v_itens, v_pct, t.desconto_global_valor, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  INSERT INTO rv_res VALUES ('R1 venda com token gravada', v_erro IS NULL, coalesce(v_erro, 'ok'));

  SELECT usado INTO v_usado FROM public.tokens_desconto_gerente WHERE token = v_tok;
  SELECT count(*) INTO v_n FROM public.vendas WHERE id = v_venda1;
  INSERT INTO rv_res VALUES ('R1b token marcado como usado e venda existe', v_usado AND v_n = 1,
    'usado=' || v_usado || ' vendas=' || v_n);

  -- R2: retry da MESMA venda: aceito, sem duplicar a venda.
  v_erro := NULL;
  BEGIN
    PERFORM public.registrar_venda_offline_com_token(v_tok, v_loja, false, v_venda1, v_caixa, v_oper, v_forma,
      t.total_bruto, t.total_desconto, t.total_liquido, v_itens, v_pct, t.desconto_global_valor, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  SELECT count(*) INTO v_n FROM public.vendas WHERE id = v_venda1;
  INSERT INTO rv_res VALUES ('R2 retry da mesma venda aceito sem duplicar', v_erro IS NULL AND v_n = 1,
    coalesce(v_erro, 'ok') || ' vendas=' || v_n);

  -- R3: OUTRA venda com o mesmo token recusada, e a venda NÃO é gravada.
  v_erro := NULL;
  BEGIN
    PERFORM public.registrar_venda_offline_com_token(v_tok, v_loja, false, v_venda2, v_caixa, v_oper, v_forma,
      t.total_bruto, t.total_desconto, t.total_liquido, v_itens, v_pct, t.desconto_global_valor, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  SELECT count(*) INTO v_n FROM public.vendas WHERE id = v_venda2;
  INSERT INTO rv_res VALUES ('R3 segunda venda com token usado recusada e não gravada',
    v_erro LIKE '%TOKEN_GERENTE_JA_USADO%' AND v_n = 0, coalesce(v_erro, 'PASSOU (FALHA)') || ' vendas=' || v_n);

  -- R4 (atomicidade): token novo, venda com falha DEPOIS do consumo (caixa nulo). O consumo deve ser desfeito.
  v_tok2 := 'RV-' || substr(md5(random()::text), 1, 12);
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por, aprovador_id)
  VALUES (v_tok2, now() + interval '1 hour', false, v_loja::text, NULL, v_ger);
  v_erro := NULL;
  BEGIN
    PERFORM public.registrar_venda_offline_com_token(v_tok2, v_loja, false, v_venda3, NULL, v_oper, v_forma,
      t.total_bruto, t.total_desconto, t.total_liquido, v_itens, v_pct, t.desconto_global_valor, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  SELECT usado INTO v_usado FROM public.tokens_desconto_gerente WHERE token = v_tok2;
  SELECT count(*) INTO v_n FROM internal.tokens_desconto_consumo_venda WHERE token = v_tok2;
  INSERT INTO rv_res VALUES ('R4 falha na venda desfaz o consumo do token',
    v_erro IS NOT NULL AND v_usado = false AND v_n = 0,
    coalesce(v_erro, 'PASSOU (FALHA)') || ' usado=' || v_usado || ' consumos=' || v_n);
END $$;

SELECT caso, CASE WHEN ok THEN 'OK' ELSE 'FALHOU' END AS resultado, detalhe FROM rv_res ORDER BY caso;

ROLLBACK;
