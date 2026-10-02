-- Multiempresa Fase 1 — ROLLBACK da migration 20261003090000 (ESCREVE / DDL).
-- Executar com: psql "$DB_URL" -1 -v ON_ERROR_STOP=1 -f 90_rollback_migration.sql
-- Pré-requisito: 80_rollback_backfill.sql (ou base sem backfill). Recusa rodar se houver dados.
-- Depois, remover a linha 20261003090000 de supabase_migrations.schema_migrations
-- (via `supabase migration repair --status reverted 20261003090000`).

DO $rb$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuario_vinculos)
     OR EXISTS (SELECT 1 FROM public.plataforma_admins)
     OR EXISTS (SELECT 1 FROM public.empresas)
     OR EXISTS (SELECT 1 FROM public.lojas WHERE empresa_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FASE1_ROLLBACK_MIGRATION: há dados nas estruturas novas — rodar 80_rollback_backfill.sql antes';
  END IF;
END
$rb$;

DROP TABLE IF EXISTS public.usuario_vinculos;
DROP TABLE IF EXISTS public.plataforma_admins;
ALTER TABLE public.lojas DROP CONSTRAINT IF EXISTS lojas_empresa_codigo_key;
ALTER TABLE public.lojas DROP CONSTRAINT IF EXISTS lojas_id_empresa_key;
DROP INDEX IF EXISTS public.idx_lojas_empresa_id;
ALTER TABLE public.lojas DROP COLUMN IF EXISTS empresa_id;
DROP TABLE IF EXISTS public.empresas;
