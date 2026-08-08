-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260806090531
-- name: 304_ssot04_drop_baixar_estoque_venda
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

DROP FUNCTION public.baixar_estoque_venda(uuid, jsonb);

DO $verify$
DECLARE
  v_sem_kardex text;
BEGIN
  IF to_regprocedure('public.baixar_estoque_venda(uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'MIG304_FUNCAO_AINDA_EXISTE';
  END IF;

  SELECT string_agg(p.proname, ', ')
  INTO v_sem_kardex
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~* 'UPDATE\s+(public\.)?estoque'
    AND position('movimentos_estoque_log' IN pg_get_functiondef(p.oid)) = 0;

  IF v_sem_kardex IS NOT NULL THEN
    RAISE EXCEPTION 'MIG304_AINDA_HA_ESCRITA_SEM_KARDEX: %', v_sem_kardex;
  END IF;

  RAISE NOTICE '304 OK';
END
$verify$;