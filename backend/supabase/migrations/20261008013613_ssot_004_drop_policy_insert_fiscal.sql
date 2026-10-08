-- NAO_APLICADA_REMOTAMENTE: defesa em profundidade SSOT-004.
-- Criada com `supabase migration new`. Entra no Git e no replay local (`db reset`).
-- Não foi aplicada no remoto por este PR. Apply remoto só com GO humano da fase C3.
-- Remove a policy residual de INSERT (mig 094). Sem GRANT ela já é inerte;
-- se o GRANT do hotfix voltar, a policy reabriria INSERT direto.
-- Não reabre GRANT.

BEGIN;

DROP POLICY IF EXISTS doc_fiscal_pendentes_insert_loja
  ON public.documentos_fiscais_pendentes;

DO $prova$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'documentos_fiscais_pendentes'
      AND grantee IN ('authenticated', 'anon')
      AND privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'SSOT-004 DROP POLICY recusou: GRANT INSERT ainda existe';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documentos_fiscais_pendentes'
      AND policyname = 'doc_fiscal_pendentes_insert_loja'
  ) THEN
    RAISE EXCEPTION 'SSOT-004 DROP POLICY FAIL: policy de INSERT ainda existe';
  END IF;
END
$prova$;

COMMIT;
