-- P0 Validation probe — run BEFORE (expect PENDING=false) and AFTER (expect true) applying 248/252/256.
-- Read-only. Safe to run any time against jinlong (kbabmewnahysfvlybiak).
WITH checks AS (
  SELECT '248 tbl venda_pos_venda_operacoes' AS obj, (to_regclass('public.venda_pos_venda_operacoes') IS NOT NULL)::text AS present
  UNION ALL SELECT '248 tbl venda_pos_venda_itens', (to_regclass('public.venda_pos_venda_itens') IS NOT NULL)::text
  UNION ALL SELECT '248 tbl estoque_reposicoes_devolucao', (to_regclass('public.estoque_reposicoes_devolucao') IS NOT NULL)::text
  UNION ALL SELECT '248 fn devolver_ou_trocar_venda', EXISTS(SELECT 1 FROM pg_proc WHERE proname='devolver_ou_trocar_venda')::text
  UNION ALL SELECT '248 fn quantidade_devolvida_item_venda', EXISTS(SELECT 1 FROM pg_proc WHERE proname='quantidade_devolvida_item_venda')::text
  UNION ALL SELECT '248 col devolucoes.operacao_id', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='devolucoes' AND column_name='operacao_id')::text
  UNION ALL SELECT '248 venda_eventos check has SALE_PARTIAL_RETURN', (COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='venda_eventos_event_type_check' AND conrelid='public.venda_eventos'::regclass),'') LIKE '%SALE_PARTIAL_RETURN%')::text
  UNION ALL SELECT '252 tbl venda_finance_context', (to_regclass('public.venda_finance_context') IS NOT NULL)::text
  UNION ALL SELECT '252 fn sincronizar_finance_context_venda', EXISTS(SELECT 1 FROM pg_proc WHERE proname='sincronizar_finance_context_venda')::text
  UNION ALL SELECT '256 fn pdv_diagnostico_pre_producao', EXISTS(SELECT 1 FROM pg_proc WHERE proname='pdv_diagnostico_pre_producao')::text
)
SELECT * FROM checks ORDER BY obj;
