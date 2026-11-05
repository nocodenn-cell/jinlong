-- FASE 3.1 — teste do consumo único do token de desconto (proposta em
-- backend/scripts/fase31-propostas/token_desconto_consumo_unico_offline.sql). Termina com ROLLBACK.
--
-- Execução (concatena a proposta e o teste, na mesma transação):
--   cat backend/scripts/fase31-propostas/token_desconto_consumo_unico_offline.sql \
--       backend/scripts/fase31-token-consumo-unico.test.sql | \
--     docker exec -i supabase_db_fastproduct psql -U postgres -d postgres -v ON_ERROR_STOP=1

BEGIN;

CREATE TEMP TABLE tk_res (caso text PRIMARY KEY, ok boolean, detalhe text) ON COMMIT DROP;

-- Loja e gerente ATIVO existentes no banco de teste (dados de teste locais).
DO $$
DECLARE
  v_loja uuid;
  v_ger uuid;
  v_loja2 uuid;
  v_venda1 uuid := gen_random_uuid();
  v_venda2 uuid := gen_random_uuid();
  v_erro text;
  v_tok text;
  v_usado boolean;
BEGIN
  SELECT u.loja_id, u.id INTO v_loja, v_ger
    FROM public.usuarios u
   WHERE u.ativo AND u.perfil = 'GERENTE' AND u.loja_id IS NOT NULL
   ORDER BY u.id LIMIT 1;
  SELECT l.id INTO v_loja2 FROM public.lojas l WHERE l.id <> v_loja ORDER BY l.id LIMIT 1;
  IF v_loja IS NULL OR v_ger IS NULL OR v_loja2 IS NULL THEN
    RAISE EXCEPTION 'PRECONDICAO: precisa de 1 gerente ativo e 2 lojas no banco de teste';
  END IF;

  -- Token com perfil de dispositivo: emissor NULL, aprovador = gerente ativo da loja.
  v_tok := 'TK-' || substr(md5(random()::text), 1, 12);
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por, aprovador_id)
  VALUES (v_tok, now() + interval '1 hour', false, v_loja::text, NULL, v_ger);

  -- T1: primeiro uso consome.
  v_erro := NULL;
  BEGIN PERFORM internal.consumir_token_desconto_venda(v_tok, v_loja, v_venda1);
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  INSERT INTO tk_res VALUES ('T1 primeiro uso da venda 1', v_erro IS NULL, coalesce(v_erro, 'consumido'));

  -- T2: retry da MESMA venda aceita, sem efeito.
  v_erro := NULL;
  BEGIN PERFORM internal.consumir_token_desconto_venda(v_tok, v_loja, v_venda1);
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  INSERT INTO tk_res VALUES ('T2 retry da mesma venda aceito', v_erro IS NULL, coalesce(v_erro, 'ok'));

  -- T3: OUTRA venda com o mesmo token recusada.
  v_erro := NULL;
  BEGIN PERFORM internal.consumir_token_desconto_venda(v_tok, v_loja, v_venda2);
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  INSERT INTO tk_res VALUES ('T3 outra venda com token já usado recusada',
    v_erro LIKE '%TOKEN_GERENTE_JA_USADO%', coalesce(v_erro, 'PASSOU (FALHA)'));

  -- T4: token revogado recusado.
  v_tok := 'TK-' || substr(md5(random()::text), 1, 12);
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por, aprovador_id, revogado_em)
  VALUES (v_tok, now() + interval '1 hour', false, v_loja::text, NULL, v_ger, now());
  v_erro := NULL;
  BEGIN PERFORM internal.consumir_token_desconto_venda(v_tok, v_loja, gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  INSERT INTO tk_res VALUES ('T4 token revogado recusado', v_erro LIKE '%REVOGADO_OU_EXPIRADO%', coalesce(v_erro, 'PASSOU (FALHA)'));

  -- T5: token expirado recusado.
  v_tok := 'TK-' || substr(md5(random()::text), 1, 12);
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por, aprovador_id)
  VALUES (v_tok, now() - interval '1 minute', false, v_loja::text, NULL, v_ger);
  v_erro := NULL;
  BEGIN PERFORM internal.consumir_token_desconto_venda(v_tok, v_loja, gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  INSERT INTO tk_res VALUES ('T5 token expirado recusado', v_erro LIKE '%REVOGADO_OU_EXPIRADO%', coalesce(v_erro, 'PASSOU (FALHA)'));

  -- T6: token de outra loja recusado.
  v_tok := 'TK-' || substr(md5(random()::text), 1, 12);
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por, aprovador_id)
  VALUES (v_tok, now() + interval '1 hour', false, v_loja::text, NULL, v_ger);
  v_erro := NULL;
  BEGIN PERFORM internal.consumir_token_desconto_venda(v_tok, v_loja2, gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  INSERT INTO tk_res VALUES ('T6 token de outra loja recusado', v_erro LIKE '%OUTRA_LOJA%', coalesce(v_erro, 'PASSOU (FALHA)'));

  -- T7: token inexistente recusado.
  v_erro := NULL;
  BEGIN PERFORM internal.consumir_token_desconto_venda('NAO-EXISTE', v_loja, gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  INSERT INTO tk_res VALUES ('T7 token inexistente recusado', v_erro LIKE '%INEXISTENTE%', coalesce(v_erro, 'PASSOU (FALHA)'));

  -- T8: aprovador inativo. Na prática o token é REVOGADO pelo trigger de revogação ao inativar o usuário
  -- (tg_revogar_tokens_usuario, 20261028120100); o consumo recusa por revogado. Não isola o trigger de consumo.
  v_tok := 'TK-' || substr(md5(random()::text), 1, 12);
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por, aprovador_id)
  VALUES (v_tok, now() + interval '1 hour', false, v_loja::text, NULL, v_ger);
  UPDATE public.usuarios SET ativo = false WHERE id = v_ger;
  v_erro := NULL;
  BEGIN PERFORM internal.consumir_token_desconto_venda(v_tok, v_loja, gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM; END;
  INSERT INTO tk_res VALUES ('T8 aprovador inativo: token revogado ao inativar o usuário', v_erro LIKE '%REVOGADO%' OR v_erro LIKE '%APROVADOR%', coalesce(v_erro, 'PASSOU (FALHA)'));
  UPDATE public.usuarios SET ativo = true WHERE id = v_ger;

  -- T9: o consumo da venda 1 ficou registrado uma única vez (sem duplicar no retry).
  SELECT count(*) = 1 INTO v_usado FROM internal.tokens_desconto_consumo_venda WHERE venda_id = v_venda1;
  INSERT INTO tk_res VALUES ('T9 consumo registrado uma vez no retry', v_usado, CASE WHEN v_usado THEN 'ok' ELSE 'duplicado (FALHA)' END);
END $$;

SELECT caso, CASE WHEN ok THEN 'OK' ELSE 'FALHOU' END AS resultado, detalhe FROM tk_res ORDER BY caso;

ROLLBACK;
