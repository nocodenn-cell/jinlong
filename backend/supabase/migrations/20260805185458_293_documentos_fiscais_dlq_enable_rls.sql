-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260805185458
-- name: 293_documentos_fiscais_dlq_enable_rls
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

BEGIN;

ALTER TABLE public.documentos_fiscais_dlq ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_fiscal_dlq_loja_isolado ON public.documentos_fiscais_dlq
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      JOIN public.usuarios u ON u.id = (SELECT auth.uid())
      WHERE v.id = documentos_fiscais_dlq.venda_id
        AND (
          u.perfil = 'ADMIN'
          OR (u.perfil = ANY (ARRAY['GERENTE', 'DONO']) AND c.loja_id = u.loja_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      JOIN public.usuarios u ON u.id = (SELECT auth.uid())
      WHERE v.id = documentos_fiscais_dlq.venda_id
        AND (
          u.perfil = 'ADMIN'
          OR (u.perfil = ANY (ARRAY['GERENTE', 'DONO']) AND c.loja_id = u.loja_id)
        )
    )
  );

COMMENT ON POLICY doc_fiscal_dlq_loja_isolado ON public.documentos_fiscais_dlq IS
  'DAT-03 (2026-08-05). Isolamento por loja via venda_id→caixas.loja_id, espelhando doc_fiscal_loja_isolado (documentos_fiscais_pendentes). ADMIN vê tudo.';

DO $verify$
BEGIN
  IF NOT (
    SELECT relrowsecurity FROM pg_class
    WHERE relname = 'documentos_fiscais_dlq' AND relnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'MIG293_RLS_NAO_HABILITADA';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'documentos_fiscais_dlq' AND policyname = 'doc_fiscal_dlq_loja_isolado'
  ) THEN
    RAISE EXCEPTION 'MIG293_POLICY_AUSENTE';
  END IF;

  RAISE NOTICE '293 OK — DAT-03 verificado no efeito';
END
$verify$;

COMMIT;
