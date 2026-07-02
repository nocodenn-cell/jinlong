-- BACKPORT (fase R1, 2026-07-02): conteúdo extraído de
-- supabase_migrations.schema_migrations.statements do projeto de produção
-- (jinlong). Esta migration foi aplicada em produção sem arquivo no repo.

CREATE OR REPLACE FUNCTION public.relatorio_resumo_executivo_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE (
  itens_vendidos numeric(14,3),
  vendas_concluidas bigint,
  vendas_canceladas bigint,
  taxa_cancelamento numeric(10,4),
  cobertura_custo numeric(10,4),
  custo_confiavel boolean,
  margem_bruta_estimada numeric(14,2)
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH vendas_periodo AS (
  SELECT
    v.id,
    v.status,
    v.total_liquido
  FROM public.vendas v
  WHERE (v.data AT TIME ZONE public.relatorio_tz_validado(p_tz))::date
    BETWEEN p_de AND p_ate
),
contagem_vendas AS (
  SELECT
    COUNT(*) FILTER (WHERE vp.status = 'CONCLUIDA')::bigint AS concluidas,
    COUNT(*) FILTER (WHERE vp.status = 'CANCELADA')::bigint AS canceladas
  FROM vendas_periodo vp
),
receita_real AS (
  SELECT COALESCE(SUM(vp.total_liquido), 0)::numeric(14,2) AS receita_total
  FROM vendas_periodo vp
  WHERE vp.status = 'CONCLUIDA'
),
itens_concluidos AS (
  SELECT
    COALESCE(SUM(iv.quantidade), 0)::numeric(14,3) AS itens_total,
    COALESCE(
      SUM(
        CASE WHEN p.preco_custo IS NOT NULL
          THEN iv.quantidade * p.preco_custo
          ELSE 0
        END
      ),
      0
    )::numeric(14,2) AS custo_conhecido,
    COALESCE(
      SUM(
        CASE WHEN p.preco_custo IS NOT NULL
          THEN iv.quantidade
          ELSE 0
        END
      ),
      0
    )::numeric(14,3) AS itens_com_custo
  FROM vendas_periodo vp
  INNER JOIN public.itens_venda iv ON iv.venda_id = vp.id
  INNER JOIN public.produtos p ON p.id = iv.produto_id
  WHERE vp.status = 'CONCLUIDA'
)
SELECT
  ic.itens_total AS itens_vendidos,
  cv.concluidas AS vendas_concluidas,
  cv.canceladas AS vendas_canceladas,
  CASE
    WHEN (cv.concluidas + cv.canceladas) = 0 THEN 0::numeric(10,4)
    ELSE (cv.canceladas::numeric / (cv.concluidas + cv.canceladas)::numeric)::numeric(10,4)
  END AS taxa_cancelamento,
  CASE
    WHEN ic.itens_total <= 0 THEN 0::numeric(10,4)
    ELSE (ic.itens_com_custo / ic.itens_total)::numeric(10,4)
  END AS cobertura_custo,
  CASE
    WHEN ic.itens_total <= 0 THEN false
    WHEN (ic.itens_com_custo / NULLIF(ic.itens_total, 0)) >= 0.95 THEN true
    ELSE false
  END AS custo_confiavel,
  CASE
    WHEN ic.itens_total <= 0 THEN 0::numeric(14,2)
    WHEN (ic.itens_com_custo / NULLIF(ic.itens_total, 0)) >= 0.95
      THEN (rr.receita_total - ic.custo_conhecido)::numeric(14,2)
    ELSE NULL::numeric(14,2)
  END AS margem_bruta_estimada
FROM contagem_vendas cv
CROSS JOIN itens_concluidos ic
CROSS JOIN receita_real rr;
$$;

COMMENT ON FUNCTION public.relatorio_resumo_executivo_periodo(date, date, text) IS
  'Resumo executivo por período (itens vendidos, cancelamento e margem estimada com gate de confiabilidade de custo). '
  'Receita base = SUM(v.total_liquido) — inclui descontos de gerente. '
  'Margem = receita_real - custo_conhecido (somente quando cobertura >= 95%).';

REVOKE ALL ON FUNCTION public.relatorio_resumo_executivo_periodo(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relatorio_resumo_executivo_periodo(date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_resumo_executivo_periodo(date, date, text) TO service_role;
