-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260806134834
-- name: 305_d1_drop_fiscal_reprocessar_documento_overload
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

BEGIN;

DROP FUNCTION IF EXISTS public.fiscal_reprocessar_documento(uuid, text);

DO $verify$
DECLARE
  v_overloads integer;
  v_def text;
BEGIN
  SELECT count(*) INTO v_overloads
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fiscal_reprocessar_documento';

  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'MIG305_OVERLOAD_RESIDUAL: esperado 1 assinatura, encontrado %', v_overloads;
  END IF;

  v_def := pg_get_functiondef('public.fiscal_reprocessar_documento(uuid)'::regprocedure);

  IF position('FISCAL_REPROCESSO_PERFIL' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG305_SEM_VERIFICACAO_DE_PERFIL: overload sobrevivente nao checa perfil';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fiscal_reprocessar_documento(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG305_GRANT_PERDIDO: authenticated deixou de poder reprocessar (regressao do painel)';
  END IF;

  RAISE NOTICE '305 OK — D-1 fechado';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;