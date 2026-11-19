-- Read-only probes for operational readiness (Jinlong).
-- NEVER run as a migration. Use: SELECT / MCP execute_sql only.
-- Expected after SSOT Oct/07 apply: all "ready" flags true.

SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS remote_migration_count,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS remote_max_version,
  EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version LIKE '20261007%'
  ) AS has_any_20261007_tracked,
  to_regprocedure('public.calcular_valor_sistema_por_forma_caixa(uuid)') IS NOT NULL
    AS has_calcular_valor_por_forma,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'caixas'
      AND column_name = 'fechamento_formas_snapshot'
  ) AS has_fechamento_formas_snapshot,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'formas_pagamento'
      AND column_name = 'conta_financeira_id'
  ) AS has_formas_conta_financeira_id,
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'documentos_fiscais_pendentes'
      AND grantee = 'authenticated'
      AND privilege_type = 'INSERT'
  ) AS ssot004_insert_revoked,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'finalizar_venda_transacional_canonica_v4'
  ) AS has_finalizar_v4,
  NOT has_table_privilege('authenticated', 'public.estoque', 'UPDATE')
    AS auth_cannot_update_estoque,
  NOT has_table_privilege('authenticated', 'public.caixas', 'UPDATE')
    AS auth_cannot_update_caixas;
