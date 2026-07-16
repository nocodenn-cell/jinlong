-- Validação (read-only) das migrations de captura 270-276 — confirma que os
-- objetos existem após aplicação (produção: já true antes de aplicar, pois
-- são no-op; rebuild: devem virar true depois de aplicar 270-276 em ordem).
WITH checks AS (
  SELECT '270 tbl funcionarios' AS obj, (to_regclass('public.funcionarios') IS NOT NULL)::text AS present
  UNION ALL SELECT '270 tbl funcionarios_meta', (to_regclass('public.funcionarios_meta') IS NOT NULL)::text
  UNION ALL SELECT '270 fn fn_criar_funcionario', EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_criar_funcionario')::text
  UNION ALL SELECT '271 tbl historico_precos_produto', (to_regclass('public.historico_precos_produto') IS NOT NULL)::text
  UNION ALL SELECT '271 trigger trg_historico_precos_produto', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_historico_precos_produto')::text
  UNION ALL SELECT '272 tbl comissoes_regras_funcionario', (to_regclass('public.comissoes_regras_funcionario') IS NOT NULL)::text
  UNION ALL SELECT '272 tbl comissoes_regras_historico', (to_regclass('public.comissoes_regras_historico') IS NOT NULL)::text
  UNION ALL SELECT '273 col vendas.cliente_id', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendas' AND column_name='cliente_id')::text
  UNION ALL SELECT '273 idx clientes_loja_documento_unique', EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='clientes_loja_documento_unique')::text
  UNION ALL SELECT '274 fn fn_listar_funcionarios_gerente', EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_listar_funcionarios_gerente')::text
  UNION ALL SELECT '274 fn caixa_integridade_gate_check', EXISTS(SELECT 1 FROM pg_proc WHERE proname='caixa_integridade_gate_check')::text
  UNION ALL SELECT '275 tbl venda_engine_shadow_runs', (to_regclass('public.venda_engine_shadow_runs') IS NOT NULL)::text
  UNION ALL SELECT '275 fn shadow_validar_venda_engine_v4', EXISTS(SELECT 1 FROM pg_proc WHERE proname='shadow_validar_venda_engine_v4')::text
  UNION ALL SELECT '276 tbl perfis', (to_regclass('public.perfis') IS NOT NULL)::text
)
SELECT * FROM checks ORDER BY obj;
