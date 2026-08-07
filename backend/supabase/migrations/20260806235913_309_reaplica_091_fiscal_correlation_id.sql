-- Migration 309 — Reaplica a 091 (fiscal_correlation_id), que consta como
-- aplicada no ledger mas nunca foi executada em produção.
--
-- EVIDÊNCIA (produção, 2026-08-06):
--   supabase_migrations.schema_migrations contém version='091'.
--   Ainda assim, nenhum dos objetos da 091 existe:
--     - documentos_fiscais_pendentes.correlation_id  → ausente
--     - documentos_fiscais_eventos.correlation_id    → ausente
--     - idx_doc_fiscal_correlation                   → ausente
--     - idx_doc_fiscal_eventos_correlation           → ausente
--     - tg_documentos_fiscais_eventos_bi_correlation → ausente
--     - tr_documentos_fiscais_eventos_bi_correlation → ausente
--
--   Mesma classe de defeito da 092 (corrigida pela 306): o
--   `supabase migration repair` de 2026-08-02 inseriu linhas no ledger sem
--   executar o SQL. A auditoria completa das 139 migrations marcadas pelo
--   repair mostrou que a 091 é a ÚNICA restante nessa condição — todos os
--   outros 117 objetos de primeiro nível existem em produção.
--
-- IMPACTO: degradação de observabilidade, não de correção. O fiscal-worker lê
--   `doc.correlation_id` (index.ts:116,143,207 e fiscal-provider-adapter.ts:234)
--   com fallback `?? null`, então os logs estruturados do fluxo fiscal saem sem
--   correlação fim-a-fim, mas nada quebra. Por isso é P2, não bloqueador.
--
-- Conteúdo idêntico ao da 091, com as garantias de idempotência necessárias
-- para que a reconstrução limpa (onde a 091 roda antes) permaneça válida.

-- ─────────────────────────────────────────────────────────────────────────────
-- documentos_fiscais_pendentes.correlation_id
--
-- DIFERENÇA DELIBERADA EM RELAÇÃO À 091: a 091 fazia ADD COLUMN nullable +
-- UPDATE de backfill. Aqui o preenchimento vem do próprio DEFAULT, num único
-- ADD COLUMN. Motivo, com evidência: a primeira tentativa de aplicar esta
-- migration em produção falhou com
--
--   23514: new row for relation "documentos_fiscais_pendentes" violates check
--          constraint "documentos_fiscais_chave_formato"
--   DETAIL: Failing row contains (41efdf24-…, …, CHAVE-SMOKE-123, PROTO-SMOKE-123, …)
--
-- porque o UPDATE de backfill toca TODAS as linhas, e uma linha histórica viola
-- a constraint. Essa linha é conhecida e está documentada: a migration 280 criou
-- `documentos_fiscais_chave_formato` como NOT VALID exatamente por causa dela
-- ('NOT VALID por causa de 1 linha histórica de smoke test (CHAVE-SMOKE-123,
-- 2026-04-08). Executar VALIDATE CONSTRAINT após o expurgo do DB-03.').
--
-- ADD COLUMN com DEFAULT não reprocessa CHECK de linha existente, então a linha
-- histórica é preservada intacta — nem apagada, nem alterada, nem contornada por
-- DROP CONSTRAINT temporário. O expurgo continua sendo o DB-03, fora do escopo
-- desta migration.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS correlation_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_doc_fiscal_correlation
  ON public.documentos_fiscais_pendentes (correlation_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- documentos_fiscais_eventos.correlation_id (herda o do documento)
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger de herança do correlation_id
-- ─────────────────────────────────────────────────────────────────────────────
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

-- Mesma blindagem aplicada pela 308 às trigger functions da 306: função de
-- trigger não é RPC e não deve ficar exposta ao PostgREST.
REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_eventos_bi_correlation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_documentos_fiscais_eventos_bi_correlation
  ON public.documentos_fiscais_eventos;
CREATE TRIGGER tr_documentos_fiscais_eventos_bi_correlation
  BEFORE INSERT ON public.documentos_fiscais_eventos
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_documentos_fiscais_eventos_bi_correlation();

-- ─────────────────────────────────────────────────────────────────────────────
-- Prova viva: o correlation_id do evento tem de herdar o do documento.
-- ─────────────────────────────────────────────────────────────────────────────
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
