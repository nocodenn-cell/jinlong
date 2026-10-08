-- SSOT-004 defesa em profundidade — remove policy INSERT residual.
--
-- Contexto: REVOKE INSERT (20261007161220 / 20261007163200) já bloqueia
-- privilege. A policy `doc_fiscal_pendentes_insert_loja` (094) permanece e
-- voltaria a autorizar INSERT se um GRANT fosse reintroduzido (hotfix).
--
-- Efeito: DROP POLICY apenas. Não concede privilégios.
-- NÃO aplicar em Jinlong remoto sem autorização humana explícita.
--
-- Rollback: recriar policy a partir de
--   094_fiscal_rls_loja_scope_transferencias_idempotencia.sql
--   (não recomendado — reabre superfície se GRANT existir).

BEGIN;

DROP POLICY IF EXISTS doc_fiscal_pendentes_insert_loja
  ON public.documentos_fiscais_pendentes;

-- Reafirma REVOKE (idempotente).
REVOKE INSERT ON public.documentos_fiscais_pendentes FROM authenticated, anon;

DO $prova$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documentos_fiscais_pendentes'
      AND policyname = 'doc_fiscal_pendentes_insert_loja'
  ) THEN
    RAISE EXCEPTION 'SSOT-004 DROP POLICY FAIL: doc_fiscal_pendentes_insert_loja ainda existe';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'documentos_fiscais_pendentes'
      AND grantee = 'authenticated'
      AND privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'SSOT-004 DROP POLICY FAIL: INSERT ainda concedido a authenticated';
  END IF;

  RAISE NOTICE 'SSOT-004 DROP POLICY PROVA OK';
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
