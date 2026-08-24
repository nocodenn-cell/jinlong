-- Preflight read-only do rollout D0-01.
-- Não cria tiers nem altera dados. Não versione a saída desta consulta.
--
-- Cobertura: um tier ativo cujo quantidade_minima é MAIOR que o limiar
-- legado (pdv_config.quantidade_minima_atacado_padrao) não protege o
-- produto — quantidades entre o limiar legado e o menor tier caem de
-- atacado (regra antiga) para varejo (calcular_preco_produto sem tier
-- aplicável nunca usa preco_atacado/quantidade_minima_atacado_padrao).
-- Checar apenas "existe algum tier ativo" esconde esse grupo.
WITH limiar_legado AS (
  SELECT quantidade_minima_atacado_padrao
  FROM public.pdv_config
  WHERE id = 1
),
menor_tier_ativo AS (
  SELECT
    pa.produto_id,
    MIN(pa.quantidade_minima) AS quantidade_minima
  FROM public.precos_atacado pa
  JOIN public.produtos pr ON pr.id = pa.produto_id
  WHERE pa.ativo = true
    AND (pa.loja_id IS NULL OR pa.loja_id = pr.loja_id)
  GROUP BY pa.produto_id
),
produtos_sem_cobertura_legado AS (
  SELECT
    p.id AS produto_id,
    COALESCE(
      NULLIF(BTRIM(p.codigo_interno::text), ''),
      NULLIF(BTRIM(p.referencia_fornecedor::text), ''),
      NULLIF(BTRIM(p.codigo_barras::text), '')
    ) AS sku_referencia,
    p.ativo,
    p.preco_varejo,
    p.preco_atacado AS preco_atacado_legado,
    mt.quantidade_minima AS menor_tier_ativo,
    ll.quantidade_minima_atacado_padrao AS limiar_legado,
    (mt.produto_id IS NOT NULL) AS tem_tier_ativo,
    (mt.produto_id IS NOT NULL
       AND mt.quantidade_minima <= ll.quantidade_minima_atacado_padrao) AS tier_cobre_limiar_legado
  FROM public.produtos p
  CROSS JOIN limiar_legado ll
  LEFT JOIN menor_tier_ativo mt ON mt.produto_id = p.id
  WHERE p.preco_atacado IS NOT NULL
)
SELECT
  produto_id,
  sku_referencia,
  ativo,
  preco_varejo,
  preco_atacado_legado,
  menor_tier_ativo,
  limiar_legado,
  tem_tier_ativo,
  tier_cobre_limiar_legado
FROM produtos_sem_cobertura_legado
WHERE tier_cobre_limiar_legado = false
ORDER BY ativo DESC, sku_referencia NULLS LAST, produto_id;

WITH limiar_legado AS (
  SELECT quantidade_minima_atacado_padrao
  FROM public.pdv_config
  WHERE id = 1
),
menor_tier_ativo AS (
  SELECT
    pa.produto_id,
    MIN(pa.quantidade_minima) AS quantidade_minima
  FROM public.precos_atacado pa
  JOIN public.produtos pr ON pr.id = pa.produto_id
  WHERE pa.ativo = true
    AND (pa.loja_id IS NULL OR pa.loja_id = pr.loja_id)
  GROUP BY pa.produto_id
),
produtos_sem_cobertura_legado AS (
  SELECT p.ativo
  FROM public.produtos p
  CROSS JOIN limiar_legado ll
  LEFT JOIN menor_tier_ativo mt ON mt.produto_id = p.id
  WHERE p.preco_atacado IS NOT NULL
    AND NOT (mt.produto_id IS NOT NULL AND mt.quantidade_minima <= ll.quantidade_minima_atacado_padrao)
)
SELECT
  COUNT(*) AS total_dependentes_legado,
  COUNT(*) FILTER (WHERE ativo = true) AS ativos_dependentes_legado,
  COUNT(*) FILTER (WHERE ativo = false) AS inativos_dependentes_legado
FROM produtos_sem_cobertura_legado;
