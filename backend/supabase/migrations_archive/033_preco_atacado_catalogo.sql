-- Preço de atacado explícito no catálogo + quantidade mínima padrão (pdv_config).

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS preco_atacado numeric(10,2)
  CHECK (preco_atacado IS NULL OR preco_atacado >= 0);

COMMENT ON COLUMN public.produtos.preco_atacado IS
  'Preço unitário atacado quando a quantidade no carrinho atinge o mínimo configurado em pdv_config; se NULL, só regras_preco aplicam atacado.';

ALTER TABLE public.pdv_config
  ADD COLUMN IF NOT EXISTS quantidade_minima_atacado_padrao numeric(10,3) NOT NULL DEFAULT 6;

COMMENT ON COLUMN public.pdv_config.quantidade_minima_atacado_padrao IS
  'Quantidade mínima (por produto no carrinho) para usar preco_atacado do catálogo.';

UPDATE public.pdv_config
SET quantidade_minima_atacado_padrao = 6
WHERE id = 1;
