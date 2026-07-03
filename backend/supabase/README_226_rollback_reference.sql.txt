-- MOVIDO PARA FORA DE supabase/migrations/ EM 2026-07-03 (mesmo motivo do
-- README_224_rollback_reference.sql.txt): o nome original
-- "226_rollback_rls_movimentos_caixa_insert_amarra_loja.sql" compartilhava o
-- prefixo numérico "226" com a migration real 226_rls_movimentos_caixa_
-- insert_amarra_loja.sql. O Supabase CLI extrai a versão do prefixo do
-- arquivo; os dois reivindicando a mesma versão 226 quebraria `db reset`/
-- replay com duplicate key em schema_migrations_pkey, mesmo erro reproduzido
-- para a 224 no CI do PR #132. Nunca foi para rodar sozinho no fluxo normal —
-- é referência manual. Ao mover para fora de supabase/migrations/, deixa de
-- ser executado por `db reset`/`db push`. Para reverter a 226 de verdade:
-- copie o conteúdo abaixo e rode manualmente contra o ambiente alvo.
--
-- ============================================================================
-- 226_rollback_rls_movimentos_caixa_insert_amarra_loja.sql (conteúdo original)
--
-- Reverte 226: volta o INSERT de movimentos_caixa a exigir apenas usuário
-- autenticado (sem amarra de loja/caixa). NÃO recomendado — reabre a brecha.

ALTER POLICY movimentos_insert ON public.movimentos_caixa
  WITH CHECK (
    ( SELECT auth.role() ) = 'authenticated'::text
  );
