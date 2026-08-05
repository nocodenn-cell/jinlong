-- ============================================================================
-- 293 — Pacote 2: fecha DAT-03.
--
-- documentos_fiscais_dlq é a única tabela sem RLS (varredura confirmada nesta
-- sessão). A migration referenciada no cabeçalho de 098_documentos_fiscais_dlq
-- ("098_documentos_fiscais_dlq_enable_rls.sql") nunca existiu no repositório.
--
-- Risco real hoje: BAIXO, não nulo. `authenticated` não tem nenhum grant na
-- tabela (confirmado: só postgres/service_role) — RLS não muda acesso atual.
-- Vira P0 no dia em que alguém conceder SELECT a `authenticated` para uma tela
-- de inspeção da DLQ (ou religar o fiscal, FLX-02) sem lembrar de isolar por
-- loja. Esta migration fecha a lacuna antes que isso aconteça.
--
-- Tabela vazia (0 linhas, confirmado) — sem risco de dado na aplicação da policy.
-- Policy espelha o padrão de documentos_fiscais_pendentes (mesma família fiscal):
-- ADMIN vê tudo; GERENTE/DONO só a loja da venda.
-- ============================================================================

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
