-- ============================================================
-- 208 — Índices trigram para a busca por nome no Caixa/PDV
-- ============================================================
-- Contexto:
--   A busca de produto no Caixa (buscarProdutoParaCaixaImpl) usa
--   `nome ILIKE '%fragmento%'` em produtos e categorias. O índice
--   existente idx_produtos_nome é GIN sobre to_tsvector('portuguese', ...),
--   que NÃO acelera ILIKE com curinga à esquerda — resultava em seq scan.
--
--   pg_trgm já está instalado (migration 115) no schema `extensions`.
--   Operadores/opclasses são referenciados de forma qualificada.
--
-- Caminho de código-de-barras (idx_produtos_codigo_barras) e o filtro
-- por categoria_id (idx_produtos_categoria) já possuem índice e não
-- são alterados aqui.

create index if not exists idx_produtos_nome_trgm
  on public.produtos
  using gin (nome extensions.gin_trgm_ops)
  where ativo = true;

create index if not exists idx_categorias_nome_trgm
  on public.categorias
  using gin (nome extensions.gin_trgm_ops);
