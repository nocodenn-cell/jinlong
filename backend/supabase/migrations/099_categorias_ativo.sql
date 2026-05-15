-- Migration 099: adiciona coluna ativo à tabela categorias
-- Necessário para o módulo Categorias de Produtos no painel gerente.

alter table public.categorias
  add column if not exists ativo boolean not null default true;

comment on column public.categorias.ativo is
  'Indica se a categoria está ativa e disponível para uso em produtos.';

-- Índice para filtros por situação na listagem gerente
create index if not exists idx_categorias_ativo
  on public.categorias(ativo);

-- Índice para busca por nome (case-insensitive)
create index if not exists idx_categorias_nome_lower
  on public.categorias(lower(nome));
