-- ================================================================
-- 117: Corrige políticas RLS de ordens_compra e ordens_compra_itens
-- ================================================================
-- A migration 115 usou (auth.jwt() -> 'user_metadata' ->> 'loja_id')::uuid
-- para isolar por tenant. Este campo nunca é populado no JWT deste projeto —
-- não existe Auth hook que copie usuarios.loja_id → user_metadata.
-- Resultado: a expressão retorna NULL e nenhum registro era acessível.
--
-- Padrão correto no projeto (migrations 042, 043, 057):
--   (SELECT u.loja_id FROM public.usuarios u WHERE u.id = auth.uid())
-- O SELECT garante que auth.uid() é avaliado uma vez por execução, não por linha.
-- ================================================================

DROP POLICY IF EXISTS oc_auth ON public.ordens_compra;
CREATE POLICY oc_auth ON public.ordens_compra
  FOR ALL TO authenticated
  USING (
    loja_id = (SELECT u.loja_id FROM public.usuarios u WHERE u.id = auth.uid())
  )
  WITH CHECK (
    loja_id = (SELECT u.loja_id FROM public.usuarios u WHERE u.id = auth.uid())
  );

DROP POLICY IF EXISTS oci_auth ON public.ordens_compra_itens;
CREATE POLICY oci_auth ON public.ordens_compra_itens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ordens_compra oc
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE oc.id = ordens_compra_itens.ordem_id
        AND oc.loja_id = u.loja_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ordens_compra oc
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE oc.id = ordens_compra_itens.ordem_id
        AND oc.loja_id = u.loja_id
    )
  );
