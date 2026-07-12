-- Seed demo de atacado: marca alguns produtos do catálogo zh com `preco_atacado`
-- para validar o gatilho automático no caixa quando a quantidade no carrinho
-- atinge `pdv_config.quantidade_minima_atacado_padrao` (default 6).
--
-- Idempotente: reexecutar atualiza o preço atacado dos mesmos IDs.
-- Pré-requisito: migrações 027 (seed produtos) e 033 (preço atacado) aplicadas.

-- Garante a quantidade mínima padrão para atacado (default = 6).
UPDATE public.pdv_config
SET quantidade_minima_atacado_padrao = 6
WHERE id = 1;

-- Marca preço atacado em produtos selecionados (snacks/bebidas com alto giro
-- + alguns acessórios de baixo ticket que normalmente vendem em volume).
UPDATE public.produtos AS p
SET preco_atacado = v.preco_atacado
FROM (
  VALUES
    -- Lanches e snacks (giro alto, varejo R$ 15,50 → atacado R$ 12,40 ≈ -20%)
    ('d1c0d200-000a-4000-8000-00000000000a'::uuid, 12.40),
    -- Bebidas (chá de jasmim, varejo R$ 24,90 → atacado R$ 19,90 ≈ -20%)
    ('d1c0d200-000b-4000-8000-00000000000b'::uuid, 19.90),
    -- Bebidas (água gaseificada, varejo R$ 6,50 → atacado R$ 5,20 ≈ -20%)
    ('d1c0d200-000c-4000-8000-00000000000c'::uuid, 5.20),
    -- Cozinha (hashis bambu, varejo R$ 12,90 → atacado R$ 9,90 ≈ -23%)
    ('d1c0d200-0005-4000-8000-000000000005'::uuid, 9.90),
    -- Acessórios eletrônicos (suporte celular, varejo R$ 19,90 → atacado R$ 14,90 ≈ -25%)
    ('d1c0d200-0009-4000-8000-000000000009'::uuid, 14.90),
    -- Acessórios eletrônicos (cabo USB-C 2m, varejo R$ 22,50 → atacado R$ 17,90 ≈ -20%)
    ('d1c0d200-0003-4000-8000-000000000003'::uuid, 17.90)
) AS v(id, preco_atacado)
WHERE p.id = v.id;
