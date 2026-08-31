-- ID 44: Validação — tier.preco_unitario sempre < produtos.preco_varejo
-- Impede criação de tiers com preço superior ao varejo (ilógico economicamente)

BEGIN;

-- Adicionar constraint se não existir (idempotente)
ALTER TABLE public.precos_atacado
ADD CONSTRAINT ck_tier_preco_menor_que_varejo
CHECK (preco_unitario < (SELECT preco_varejo FROM public.produtos WHERE id = produto_id));

COMMENT ON CONSTRAINT ck_tier_preco_menor_que_varejo ON public.precos_atacado IS
  'ID 44: Assegura que preço de tier atacado é sempre menor que preço varejo do produto';

COMMIT;
