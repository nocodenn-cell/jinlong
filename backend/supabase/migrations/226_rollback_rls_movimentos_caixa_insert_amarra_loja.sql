-- 226_rollback_rls_movimentos_caixa_insert_amarra_loja.sql
--
-- Reverte 226: volta o INSERT de movimentos_caixa a exigir apenas usuário
-- autenticado (sem amarra de loja/caixa). NÃO recomendado — reabre a brecha.

ALTER POLICY movimentos_insert ON public.movimentos_caixa
  WITH CHECK (
    ( SELECT auth.role() ) = 'authenticated'::text
  );
