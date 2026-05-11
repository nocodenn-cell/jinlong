-- Adiciona coluna `ativo` em categorias para alinhar com demais cadastros.

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

