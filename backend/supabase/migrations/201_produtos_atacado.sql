-- Adiciona suporte a preços de atacado automático
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS preco_atacado DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS quantidade_gatilho_atacado INT;

COMMENT ON COLUMN public.produtos.preco_atacado IS 'Preço especial para vendas no atacado';
COMMENT ON COLUMN public.produtos.quantidade_gatilho_atacado IS 'Quantidade mínima para ativar o preço de atacado';

CREATE INDEX IF NOT EXISTS idx_produtos_precos
  ON public.produtos (id, preco_atacado, quantidade_gatilho_atacado)
  WHERE preco_atacado IS NOT NULL AND quantidade_gatilho_atacado IS NOT NULL;
