-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260806140528
-- name: 308_hardening_tg_documentos_fiscais_estado
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bi() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bi() FROM anon;
REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bi() FROM authenticated;

REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bu() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bu() FROM anon;
REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_estado_bu() FROM authenticated;

DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.tg_documentos_fiscais_estado_bi()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tg_documentos_fiscais_estado_bi()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.tg_documentos_fiscais_estado_bu()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tg_documentos_fiscais_estado_bu()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG308_TRIGGER_AINDA_EXPOSTA';
  END IF;

  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.documentos_fiscais_pendentes'::regclass
        AND tgname IN ('tr_documentos_fiscais_estado_bi','tr_documentos_fiscais_estado_bu')) <> 2 THEN
    RAISE EXCEPTION 'MIG308_TRIGGERS_SUMIRAM';
  END IF;

  RAISE NOTICE '308 OK';
END
$verify$;