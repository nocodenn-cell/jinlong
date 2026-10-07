-- SSOT-004 — enqueue fiscal só via RPC canônica.
--
-- Reafirma REVOKE INSERT em documentos_fiscais_pendentes para authenticated/anon.
-- (Também aplicado em 20261007161220_fiscal_cancelado_ssot.sql — idempotente.)
-- App: enfileirarDocFiscalStub removido; check-entity-ssot bloqueia reintrodução.
--
-- Rollback: GRANT INSERT ON public.documentos_fiscais_pendentes TO authenticated;
--           (não recomendado — reabre bypass do stub.)

BEGIN;

REVOKE INSERT ON public.documentos_fiscais_pendentes FROM authenticated, anon;

DO $prova$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'documentos_fiscais_pendentes'
      AND grantee = 'authenticated'
      AND privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'SSOT-004 PROVA FAIL: INSERT ainda concedido a authenticated';
  END IF;

  IF to_regprocedure('public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)') IS NULL THEN
    RAISE EXCEPTION 'SSOT-004 PROVA FAIL: RPC fiscal_enfileirar_documento_venda ausente';
  END IF;

  RAISE NOTICE 'SSOT-004 PROVA ESTRUTURAL OK: INSERT revogado; RPC enqueue presente';
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
