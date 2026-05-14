-- Índices para filtros frequentes na listagem de produtos.

CREATE INDEX IF NOT EXISTS idx_produtos_marca_id ON public.produtos (marca_id)
  WHERE marca_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_tags_gin ON public.produtos USING gin (tags);

-- categorias / fornecedores já têm índices em 001 e 075; reforço apenas se faltar.
CREATE INDEX IF NOT EXISTS idx_produtos_categoria_id ON public.produtos (categoria_id)
  WHERE categoria_id IS NOT NULL;
