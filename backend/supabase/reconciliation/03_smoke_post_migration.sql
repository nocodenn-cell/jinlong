-- P0 Smoke pós-migration (read-only) — rodar DEPOIS de aplicar 248/252/256.
-- Confirma que os objetos existem, estão íntegros e que o fluxo canônico de venda não regrediu.
-- Para o smoke transacional COMPLETO da devolução (248), use:
--   backend/supabase/scripts/homolog_sprint_b_devolucao_smoke.sql  (executa devolução ponta a ponta e reverte)

WITH smoke AS (
  -- 248: objetos + view estendida + check estendido
  SELECT '248 fn devolver_ou_trocar_venda callable' AS check, EXISTS(SELECT 1 FROM pg_proc WHERE proname='devolver_ou_trocar_venda')::text AS ok
  UNION ALL SELECT '248 v_kardex tem ramo devolucao', (pg_get_viewdef('public.v_kardex_unificado'::regclass, true) LIKE '%devolucao%' OR pg_get_viewdef('public.v_kardex_unificado'::regclass, true) LIKE '%DEVOLUCAO%')::text
  UNION ALL SELECT '248 venda_eventos check estendido', (COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='venda_eventos_event_type_check' AND conrelid='public.venda_eventos'::regclass),'') LIKE '%DEVOLUCAO%')::text
  UNION ALL SELECT '248 RLS ativa em estoque_reposicoes_devolucao', COALESCE((SELECT relrowsecurity::text FROM pg_class WHERE oid='public.estoque_reposicoes_devolucao'::regclass),'MISSING')
  -- 252: espelho + trigger
  UNION ALL SELECT '252 venda_finance_context existe', (to_regclass('public.venda_finance_context') IS NOT NULL)::text
  UNION ALL SELECT '252 fn sincronizar_finance_context_venda', EXISTS(SELECT 1 FROM pg_proc WHERE proname='sincronizar_finance_context_venda')::text
  -- 256: diagnostico
  UNION ALL SELECT '256 fn pdv_diagnostico_pre_producao', EXISTS(SELECT 1 FROM pg_proc WHERE proname='pdv_diagnostico_pre_producao')::text
  -- Não-regressão do fluxo canônico de venda:
  UNION ALL SELECT 'RPC v4 canonica presente', EXISTS(SELECT 1 FROM pg_proc WHERE proname='finalizar_venda_transacional_canonica_v4')::text
  UNION ALL SELECT 'RPC registrar_venda_com_itens (local) presente', EXISTS(SELECT 1 FROM pg_proc WHERE proname='registrar_venda_com_itens')::text
  -- Segurança pós-DDL: nenhum advisor deve virar ERROR (checar via get_advisors após rodar isto)
)
SELECT * FROM smoke ORDER BY check;
