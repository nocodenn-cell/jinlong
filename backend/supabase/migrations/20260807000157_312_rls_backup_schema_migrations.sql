-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260807000157
-- name: 312_rls_backup_schema_migrations
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

DO $rls_backup_312$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = '_backup_schema_migrations_20260802'
      AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'MIGRATION_312: _backup_schema_migrations_20260802 não existe neste banco (reconstrução limpa) — nada a fazer.';
    RETURN;
  END IF;

  EXECUTE 'REVOKE ALL ON TABLE public._backup_schema_migrations_20260802 FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON TABLE public._backup_schema_migrations_20260802 FROM anon';
  EXECUTE 'REVOKE ALL ON TABLE public._backup_schema_migrations_20260802 FROM authenticated';
  EXECUTE 'ALTER TABLE public._backup_schema_migrations_20260802 ENABLE ROW LEVEL SECURITY';
  EXECUTE $c$COMMENT ON TABLE public._backup_schema_migrations_20260802 IS
    'Cópia de supabase_migrations.schema_migrations anterior ao `supabase migration repair` de 2026-08-02 (100 linhas). Evidência forense: comparar com o ledger atual mostra quais versões foram marcadas como aplicadas sem execução. Somente service_role — RLS habilitada sem policy, sem GRANT para anon/authenticated.'$c$;

  IF has_table_privilege('anon', 'public._backup_schema_migrations_20260802', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION_312: anon ainda lê a tabela de backup';
  END IF;
  IF has_table_privilege('authenticated', 'public._backup_schema_migrations_20260802', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION_312: authenticated ainda lê a tabela de backup';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = '_backup_schema_migrations_20260802'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'MIGRATION_312: RLS não habilitada na tabela de backup';
  END IF;
END;
$rls_backup_312$;

NOTIFY pgrst, 'reload schema';