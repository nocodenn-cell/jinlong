-- Preflight read-only do rollout D0-01.
-- Não cria tiers nem altera dados. Não versione a saída desta consulta.

WITH produtos_sem_tier_ativo AS (
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
    EXISTS (
      SELECT 1
      FROM public.precos_atacado pa
      WHERE pa.produto_id = p.id
        AND pa.ativo = true
    ) AS tem_tier_ativo
  FROM public.produtos p
  WHERE p.preco_atacado IS NOT NULL
)
SELECT
  produto_id,
  sku_referencia,
  ativo,
  preco_varejo,
  preco_atacado_legado,
  tem_tier_ativo
FROM produtos_sem_tier_ativo
WHERE tem_tier_ativo = false
ORDER BY ativo DESC, sku_referencia NULLS LAST, produto_id;

WITH produtos_sem_tier_ativo AS (
  SELECT p.ativo
  FROM public.produtos p
  WHERE p.preco_atacado IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.precos_atacado pa
      WHERE pa.produto_id = p.id
        AND pa.ativo = true
    )
)
SELECT
  COUNT(*) AS total_dependentes_legado,
  COUNT(*) FILTER (WHERE ativo = true) AS ativos_dependentes_legado,
  COUNT(*) FILTER (WHERE ativo = false) AS inativos_dependentes_legado
FROM produtos_sem_tier_ativo;

