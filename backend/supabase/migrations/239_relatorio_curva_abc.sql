-- 239_relatorio_curva_abc.sql
--
-- Bloco 3 ("evolução ERP real") — curva ABC de produtos. Cálculo simples
-- (sem pipeline analítico, sem infra nova): ranqueia produtos por faturamento
-- no período (mesma fonte de dados de relatorio_top_produtos_periodo, 013) e
-- classifica pelo critério clássico de Pareto sobre o valor acumulado:
--   A: acumulado até 80% do faturamento total do período
--   B: acumulado entre 80% e 95%
--   C: restante (acumulado > 95%)
-- Leitura/agregação pura sobre vendas CONCLUIDAs; não altera nenhuma regra de
-- preço/estoque e não introduz cache ou job — se cache leve for necessário no
-- futuro, deve ser feito no nível do backend (ex.: revalidate do Next), nunca
-- como tabela materializada/trigger no banco.

CREATE OR REPLACE FUNCTION public.relatorio_curva_abc_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo',
  p_limite integer DEFAULT 500
)
RETURNS TABLE (
  produto_id uuid,
  nome text,
  total_quantidade numeric,
  total_valor numeric,
  percentual_valor numeric(10,4),
  percentual_acumulado numeric(10,4),
  classe_abc text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  WITH z AS (SELECT public.relatorio_tz_validado(p_tz) AS tz),
  vendas_prod AS (
    SELECT
      p.id,
      p.nome,
      sum(iv.quantidade)::numeric AS total_quantidade,
      sum(iv.quantidade * iv.preco_unitario)::numeric AS total_valor
    FROM public.itens_venda iv
    INNER JOIN public.vendas v ON v.id = iv.venda_id
    INNER JOIN public.produtos p ON p.id = iv.produto_id
    CROSS JOIN z
    WHERE v.status = 'CONCLUIDA'
      AND (v.data AT TIME ZONE z.tz)::date >= p_de
      AND (v.data AT TIME ZONE z.tz)::date <= p_ate
    GROUP BY p.id, p.nome
  ),
  totais AS (
    SELECT coalesce(sum(total_valor), 0)::numeric AS total_geral FROM vendas_prod
  ),
  ranked AS (
    SELECT
      vp.*,
      sum(vp.total_valor) OVER (ORDER BY vp.total_valor DESC, vp.id) AS acumulado
    FROM vendas_prod vp
  )
  SELECT
    r.id AS produto_id,
    r.nome,
    r.total_quantidade,
    r.total_valor,
    CASE WHEN t.total_geral > 0 THEN (r.total_valor / t.total_geral * 100)::numeric(10,4) ELSE 0::numeric(10,4) END AS percentual_valor,
    CASE WHEN t.total_geral > 0 THEN (r.acumulado / t.total_geral * 100)::numeric(10,4) ELSE 0::numeric(10,4) END AS percentual_acumulado,
    CASE
      WHEN t.total_geral <= 0 THEN 'C'
      WHEN (r.acumulado / t.total_geral * 100) <= 80 THEN 'A'
      WHEN (r.acumulado / t.total_geral * 100) <= 95 THEN 'B'
      ELSE 'C'
    END AS classe_abc
  FROM ranked r
  CROSS JOIN totais t
  ORDER BY r.total_valor DESC, r.id
  LIMIT CASE
    WHEN p_limite IS NULL OR p_limite < 1 THEN 500
    WHEN p_limite > 1000 THEN 1000
    ELSE p_limite
  END;
$$;

COMMENT ON FUNCTION public.relatorio_curva_abc_periodo(date, date, text, integer) IS
  'Classificação ABC de produtos por faturamento no período (corte de Pareto 80/95). Cálculo simples, sem pipeline analítico.';

GRANT EXECUTE ON FUNCTION public.relatorio_curva_abc_periodo(date, date, text, integer) TO authenticated;
