-- P1: correlation_id fim-a-fim (documento + eventos) para rastreio e logs estruturados.

ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS correlation_id uuid;

UPDATE public.documentos_fiscais_pendentes
SET correlation_id = gen_random_uuid()
WHERE correlation_id IS NULL;

ALTER TABLE public.documentos_fiscais_pendentes
  ALTER COLUMN correlation_id SET DEFAULT gen_random_uuid();

ALTER TABLE public.documentos_fiscais_pendentes
  ALTER COLUMN correlation_id SET NOT NULL;

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

DROP TRIGGER IF EXISTS tr_documentos_fiscais_eventos_bi_correlation ON public.documentos_fiscais_eventos;
CREATE TRIGGER tr_documentos_fiscais_eventos_bi_correlation
  BEFORE INSERT ON public.documentos_fiscais_eventos
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_documentos_fiscais_eventos_bi_correlation();
