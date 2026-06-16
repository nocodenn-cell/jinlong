-- 238_relatorio_margem_por_venda.sql
--
-- Bloco 2 ("evolução ERP real") — margem real por pedido. Pura leitura +
-- agregação sobre dados já existentes (vendas/itens_venda); não recalcula
-- histórico, não altera nenhuma regra de preço/estoque, não cria pipeline
-- novo. Mesmo padrão e mesmo gate de confiabilidade de custo já usado por
-- relatorio_resumo_executivo_periodo (064): só expõe margem quando >=95% da
-- quantidade vendida na venda tem custo conhecido.
--
-- Diferença em relação a 064: aqui o custo é por VENDA (não agregado no
-- período todo) e prioriza o snapshot `itens_venda.custo_unitario_snap`
-- (capturado no momento da venda, migration 235) sobre `produtos.preco_custo`
-- atual — mais fiel ao custo real daquela venda específica. Vendas antigas
-- (sem snapshot) caem no fallback de produtos.preco_custo, igual à 064.
--
-- "Frete"/"taxas": não existem colunas correspondentes em vendas/itens_venda
-- (confirmado em todas as migrations) — margem usa total_liquido (já líquido
-- de desconto) menos custo estimado.

CREATE OR REPLACE FUNCTION public.relatorio_margem_por_venda_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo',
  p_limite integer DEFAULT 200
)
RETURNS TABLE (
  venda_id uuid,
  data timestamptz,
  num_itens numeric(14,3),
  total_liquido numeric(14,2),
  total_desconto numeric(14,2),
  custo_total_estimado numeric(14,2),
  margem_estimada numeric(14,2),
  custo_confiavel boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH vendas_periodo AS (
  SELECT v.id, v.data, v.total_liquido, v.total_desconto
  FROM public.vendas v
  WHERE v.status = 'CONCLUIDA'
    AND (v.data AT TIME ZONE public.relatorio_tz_validado(p_tz))::date BETWEEN p_de AND p_ate
),
itens_custo AS (
  SELECT
    iv.venda_id,
    SUM(iv.quantidade) AS qtd_total,
    SUM(
      CASE WHEN COALESCE(iv.custo_unitario_snap, p.preco_custo) IS NOT NULL
        THEN iv.quantidade * COALESCE(iv.custo_unitario_snap, p.preco_custo)
        ELSE 0
      END
    ) AS custo_total,
    SUM(
      CASE WHEN COALESCE(iv.custo_unitario_snap, p.preco_custo) IS NOT NULL
        THEN iv.quantidade
        ELSE 0
      END
    ) AS qtd_com_custo
  FROM public.itens_venda iv
  INNER JOIN public.produtos p ON p.id = iv.produto_id
  WHERE iv.venda_id IN (SELECT id FROM vendas_periodo)
  GROUP BY iv.venda_id
)
SELECT
  vp.id AS venda_id,
  vp.data,
  COALESCE(ic.qtd_total, 0)::numeric(14,3) AS num_itens,
  vp.total_liquido::numeric(14,2) AS total_liquido,
  vp.total_desconto::numeric(14,2) AS total_desconto,
  CASE
    WHEN COALESCE(ic.qtd_total, 0) > 0 AND (ic.qtd_com_custo / ic.qtd_total) >= 0.95
      THEN ic.custo_total::numeric(14,2)
    ELSE NULL
  END AS custo_total_estimado,
  CASE
    WHEN COALESCE(ic.qtd_total, 0) > 0 AND (ic.qtd_com_custo / ic.qtd_total) >= 0.95
      THEN (vp.total_liquido - ic.custo_total)::numeric(14,2)
    ELSE NULL
  END AS margem_estimada,
  COALESCE(ic.qtd_total, 0) > 0 AND (ic.qtd_com_custo / NULLIF(ic.qtd_total, 0)) >= 0.95 AS custo_confiavel
FROM vendas_periodo vp
LEFT JOIN itens_custo ic ON ic.venda_id = vp.id
ORDER BY vp.data DESC
LIMIT p_limite;
$$;

COMMENT ON FUNCTION public.relatorio_margem_por_venda_periodo(date, date, text, integer) IS
  'Margem real por venda (lucro = total_liquido - custo estimado da venda), com o mesmo gate de confiabilidade de custo da relatorio_resumo_executivo_periodo. Leitura/agregação pura, sem recálculo de histórico.';

REVOKE ALL ON FUNCTION public.relatorio_margem_por_venda_periodo(date, date, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relatorio_margem_por_venda_periodo(date, date, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_margem_por_venda_periodo(date, date, text, integer) TO service_role;
