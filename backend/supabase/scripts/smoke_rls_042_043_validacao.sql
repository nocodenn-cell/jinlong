-- =============================================================================
-- Smoke estrutural: migrations 042 (RLS loja) + 043 (índice caixas + SELECT DONO global)
-- =============================================================================
--
-- >>> COMO USAR NO SUPABASE SQL EDITOR <<<
-- NÃO execute a linha de caminho do arquivo (ex.: backend/supabase/scripts/...).
-- Abra ESTE arquivo no VS Code/Cursor, selecione TODO o conteúdo (Ctrl+A), copie e
-- cole no SQL Editor. Só comandos SQL e comentários -- são válidos.
--
-- Ordem: aplicar migrations 042 e 043 antes (ex.: npx supabase db push).
-- Role: postgres (ou equivalente que leia pg_indexes / pg_policies).
--
-- Validação DONO vs GERENTE no app é manual (JWT); aqui só o catálogo.
-- =============================================================================

-- 0) Legado ainda presente? Se retornar linhas, este projeto NÃO recebeu 042/043 (ou é outro DB).
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('vendas', 'estoque')
  AND policyname IN (
    'vendas_operador',
    'vendas_gerente',
    'estoque_leitura',
    'estoque_escrita'
  )
ORDER BY tablename, policyname;
-- Aceite após 042+043: 0 linhas (resultado vazio)

-- 1) Índice em caixas(loja_id) — migration 043
SELECT
  COUNT(*) AS ok_idx_caixas_loja_id
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'idx_caixas_loja_id';
-- Aceite: ok_idx_caixas_loja_id = 1

-- 2) Índice em vendas(caixa_id) — baseline 001 (join RLS 042)
SELECT
  COUNT(*) AS ok_idx_vendas_caixa
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'idx_vendas_caixa';
-- Aceite: ok_idx_vendas_caixa = 1

-- 3) Políticas esperadas em vendas (042 + 043)
SELECT
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'vendas'
ORDER BY policyname;
-- Aceite: contém vendas_delete_loja, vendas_insert_loja, vendas_select_dono_todas_lojas,
--         vendas_select_loja, vendas_update_loja

-- 4) Políticas esperadas em estoque (042 + 043)
SELECT
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'estoque'
ORDER BY policyname;
-- Aceite: contém estoque_delete_gerente_loja, estoque_insert_gerente_loja,
--         estoque_select_dono_todas_lojas, estoque_select_mesma_loja, estoque_update_gerente_loja

-- 5) Contagem mínima (ajuste se renomear políticas)
SELECT
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vendas') AS n_policies_vendas,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'estoque') AS n_policies_estoque;
-- Aceite típico: n_policies_vendas >= 5, n_policies_estoque >= 5
