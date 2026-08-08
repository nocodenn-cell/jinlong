-- 241_relatorio_margem_por_venda_snapshot_only.sql
--
-- Correção de arquitetura (camada de observabilidade, não BI engine):
-- a migration 238 calculava o custo da venda com FALLBACK
-- COALESCE(iv.custo_unitario_snap, produtos.preco_custo). Isso violava a
-- regra de fonte única por métrica:
--   margem = SEMPRE baseada em itens_venda.custo_unitario_snap (snapshot
--   operacional capturado no momento da venda).
-- O fallback para produtos.preco_custo (custo ATUAL do cadastro) era uma
-- segunda fonte de verdade e uma regra de cálculo nova dentro do relatório.
--
-- Esta migration substitui a função para usar EXCLUSIVAMENTE o snapshot:
-- itens sem custo_unitario_snap simplesmente não entram no custo, e a venda
-- é marcada custo_confiavel=false (mesmo gate de cobertura >=95%). Assim a
-- margem do relatório bate 1:1 com o snapshot operacional, sem recálculo,
-- sem fonte paralela e sem fallback. O JOIN com produtos deixa de ser
-- necessário (nada além do snapshot é lido).

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
    -- Custo SOMENTE do snapshot operacional (sem fallback ao cadastro atual).
    SUM(
      CASE WHEN iv.custo_unitario_snap IS NOT NULL
        THEN iv.quantidade * iv.custo_unitario_snap
        ELSE 0
      END
    ) AS custo_total,
    SUM(
      CASE WHEN iv.custo_unitario_snap IS NOT NULL
        THEN iv.quantidade
        ELSE 0
      END
    ) AS qtd_com_custo
  FROM public.itens_venda iv
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
  'View analítica passiva: margem por venda = total_liquido - SOMA(quantidade * itens_venda.custo_unitario_snap). Fonte ÚNICA de custo = snapshot operacional, sem fallback ao cadastro atual. Sem recálculo de histórico.';

REVOKE ALL ON FUNCTION public.relatorio_margem_por_venda_periodo(date, date, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relatorio_margem_por_venda_periodo(date, date, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_margem_por_venda_periodo(date, date, text, integer) TO service_role;
