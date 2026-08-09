-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260806235913
-- name: 309_reaplica_091_fiscal_correlation_id
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS correlation_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_doc_fiscal_correlation
  ON public.documentos_fiscais_pendentes (correlation_id);

ALTER TABLE public.documentos_fiscais_eventos
  ADD COLUMN IF NOT EXISTS correlation_id uuid;

UPDATE public.documentos_fiscais_eventos e
SET correlation_id = d.correlation_id
FROM public.documentos_fiscais_pendentes d
WHERE e.documento_id = d.id
  AND e.correlation_id IS NULL;

UPDATE public.documentos_fiscais_eventos
SET correlation_id = gen_random_uuid()
WHERE correlation_id IS NULL;

ALTER TABLE public.documentos_fiscais_eventos
  ALTER COLUMN correlation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_doc_fiscal_eventos_correlation
  ON public.documentos_fiscais_eventos (correlation_id);

CREATE OR REPLACE FUNCTION public.tg_documentos_fiscais_eventos_bi_correlation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.correlation_id IS NULL AND NEW.documento_id IS NOT NULL THEN
    SELECT d.correlation_id
    INTO NEW.correlation_id
    FROM public.documentos_fiscais_pendentes d
    WHERE d.id = NEW.documento_id;
  END IF;

  IF NEW.correlation_id IS NULL THEN
    NEW.correlation_id := gen_random_uuid();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_eventos_bi_correlation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_documentos_fiscais_eventos_bi_correlation
  ON public.documentos_fiscais_eventos;
CREATE TRIGGER tr_documentos_fiscais_eventos_bi_correlation
  BEFORE INSERT ON public.documentos_fiscais_eventos
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_documentos_fiscais_eventos_bi_correlation();

DO $verify_309$
DECLARE
  v_col_doc  int;
  v_col_ev   int;
  v_trigger  int;
BEGIN
  SELECT count(*) INTO v_col_doc FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'documentos_fiscais_pendentes'
     AND column_name = 'correlation_id'
     AND is_nullable = 'NO';
  IF v_col_doc <> 1 THEN
    RAISE EXCEPTION 'MIGRATION_309: documentos_fiscais_pendentes.correlation_id ausente ou nullable';
  END IF;

  SELECT count(*) INTO v_col_ev FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'documentos_fiscais_eventos'
     AND column_name = 'correlation_id'
     AND is_nullable = 'NO';
  IF v_col_ev <> 1 THEN
    RAISE EXCEPTION 'MIGRATION_309: documentos_fiscais_eventos.correlation_id ausente ou nullable';
  END IF;

  SELECT count(*) INTO v_trigger FROM pg_trigger
   WHERE NOT tgisinternal
     AND tgname = 'tr_documentos_fiscais_eventos_bi_correlation';
  IF v_trigger <> 1 THEN
    RAISE EXCEPTION 'MIGRATION_309: trigger de herança de correlation_id não criada';
  END IF;
END;
$verify_309$;

NOTIFY pgrst, 'reload schema';
