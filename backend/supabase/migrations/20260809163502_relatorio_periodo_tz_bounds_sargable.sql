-- RECONCILIAÇÃO DE DRIFT (repositório ← produção), 2026-08-09.
--
-- A versão 20260809163502 consta em supabase_migrations.schema_migrations
-- (aplicada em produção) mas o arquivo correspondente nunca foi versionado.
-- Além disso, três funções de relatório (resumo executivo, margem por venda e
-- curva ABC) foram alteradas em produção sem registro de migration.
--
-- Este arquivo reproduz FIELMENTE o estado atual de produção (extraído de
-- pg_get_functiondef / schema_migrations.statements). Nada aqui muda o banco
-- de produção — a versão já está registrada como aplicada. Serve para que um
-- rebuild do schema a partir do repositório reproduza produção.
--
-- Conteúdo: janela de período materializada uma única vez e predicado
-- sargável em vendas.data (timestamptz), em lugar de
-- (v.data AT TIME ZONE relatorio_tz_validado(p_tz))::date por linha.

ALTER FUNCTION public.relatorio_tz_validado(text) COST 5000;

COMMENT ON FUNCTION public.relatorio_tz_validado(text) IS
  'Normaliza nome IANA: vazio ou inválido → America/Sao_Paulo. STABLE (catálogo SO). COST alto: NÃO usar no predicado por linha — materializar uma vez (CTE MATERIALIZED / variável plpgsql) e filtrar por bounds timestamptz.';

CREATE OR REPLACE FUNCTION public.relatorio_vendas_por_dia_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE (
  dia date,
  num_vendas bigint,
  total_liquido numeric,
  ticket_medio numeric,
  total_desconto numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  WITH z AS MATERIALIZED (
    SELECT public.relatorio_tz_validado(p_tz) AS tz
  ),
  bounds AS MATERIALIZED (
    SELECT
      (p_de::timestamp AT TIME ZONE z.tz) AS inicio,
      ((p_ate + 1)::timestamp AT TIME ZONE z.tz) AS fim
    FROM z
  )
  SELECT
    (v.data AT TIME ZONE z.tz)::date AS dia,
    count(*)::bigint AS num_vendas,
    coalesce(sum(v.total_liquido), 0)::numeric AS total_liquido,
    coalesce(avg(v.total_liquido), 0)::numeric AS ticket_medio,
    coalesce(sum(v.total_desconto), 0)::numeric AS total_desconto
  FROM public.vendas v
  CROSS JOIN z
  CROSS JOIN bounds b
  WHERE v.status = 'CONCLUIDA'
    AND v.data >= b.inicio
    AND v.data < b.fim
  GROUP BY (v.data AT TIME ZONE z.tz)::date
  ORDER BY dia DESC;
$$;

COMMENT ON FUNCTION public.relatorio_vendas_por_dia_periodo(date, date, text) IS
  'Vendas CONCLUIDAs por dia no período (fuso IANA). Bounds timestamptz materializados uma vez; predicado sargável em vendas.data.';

CREATE OR REPLACE FUNCTION public.relatorio_top_produtos_periodo(
  p_de date,
  p_ate date,
  p_limite integer DEFAULT 50,
  p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE (
  id uuid,
  nome text,
  origem text,
  total_quantidade numeric,
  total_valor numeric,
  num_vendas bigint,
  qtde_atacado numeric,
  qtde_varejo numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  WITH z AS MATERIALIZED (
    SELECT public.relatorio_tz_validado(p_tz) AS tz
  ),
  bounds AS MATERIALIZED (
    SELECT
      (p_de::timestamp AT TIME ZONE z.tz) AS inicio,
      ((p_ate + 1)::timestamp AT TIME ZONE z.tz) AS fim
    FROM z
  )
  SELECT
    p.id,
    p.nome,
    p.origem,
    sum(iv.quantidade)::numeric AS total_quantidade,
    sum(iv.quantidade * iv.preco_unitario)::numeric AS total_valor,
    count(DISTINCT iv.venda_id)::bigint AS num_vendas,
    sum(CASE WHEN iv.tipo_preco = 'ATACADO' THEN iv.quantidade ELSE 0 END)::numeric AS qtde_atacado,
    sum(CASE WHEN iv.tipo_preco = 'VAREJO' THEN iv.quantidade ELSE 0 END)::numeric AS qtde_varejo
  FROM public.itens_venda iv
  INNER JOIN public.vendas v ON v.id = iv.venda_id
  INNER JOIN public.produtos p ON p.id = iv.produto_id
  CROSS JOIN z
  CROSS JOIN bounds b
  WHERE v.status = 'CONCLUIDA'
    AND v.data >= b.inicio
    AND v.data < b.fim
  GROUP BY p.id, p.nome, p.origem
  ORDER BY total_valor DESC NULLS LAST
  LIMIT CASE
    WHEN p_limite IS NULL OR p_limite < 1 THEN 50
    WHEN p_limite > 200 THEN 200
    ELSE p_limite
  END;
$$;

COMMENT ON FUNCTION public.relatorio_top_produtos_periodo(date, date, integer, text) IS
  'Top produtos por faturamento no período (fuso IANA). Bounds timestamptz materializados uma vez; predicado sargável em vendas.data.';

-- ---------------------------------------------------------------------------
-- Abaixo: funções alteradas em produção SEM registro de migration.
-- Transcritas de pg_get_functiondef() em 2026-08-09.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.relatorio_resumo_executivo_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo'::text
)
RETURNS TABLE (
  itens_vendidos numeric,
  vendas_concluidas bigint,
  vendas_canceladas bigint,
  taxa_cancelamento numeric,
  cobertura_custo numeric,
  custo_confiavel boolean,
  margem_bruta_estimada numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH z AS MATERIALIZED (
  SELECT public.relatorio_tz_validado(p_tz) AS tz
),
bounds AS MATERIALIZED (
  SELECT
    (p_de::timestamp AT TIME ZONE z.tz) AS inicio,
    ((p_ate + 1)::timestamp AT TIME ZONE z.tz) AS fim
  FROM z
),
vendas_periodo AS (
  SELECT
    v.id,
    v.status,
    v.total_liquido
  FROM public.vendas v
  CROSS JOIN bounds b
  WHERE v.data >= b.inicio
    AND v.data < b.fim
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
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_margem_por_venda_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo'::text,
  p_limite integer DEFAULT 200
)
RETURNS TABLE (
  venda_id uuid,
  data timestamp with time zone,
  num_itens numeric,
  total_liquido numeric,
  total_desconto numeric,
  custo_total_estimado numeric,
  margem_estimada numeric,
  custo_confiavel boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH z AS MATERIALIZED (
  SELECT public.relatorio_tz_validado(p_tz) AS tz
),
bounds AS MATERIALIZED (
  SELECT
    (p_de::timestamp AT TIME ZONE z.tz) AS inicio,
    ((p_ate + 1)::timestamp AT TIME ZONE z.tz) AS fim
  FROM z
),
vendas_periodo AS (
  SELECT v.id, v.data, v.total_liquido, v.total_desconto
  FROM public.vendas v
  CROSS JOIN bounds b
  WHERE v.status = 'CONCLUIDA'
    AND v.data >= b.inicio
    AND v.data < b.fim
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
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_curva_abc_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo'::text,
  p_limite integer DEFAULT 500
)
RETURNS TABLE (
  produto_id uuid,
  nome text,
  total_quantidade numeric,
  total_valor numeric,
  percentual_valor numeric,
  percentual_acumulado numeric,
  classe_abc text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $function$
  WITH z AS MATERIALIZED (
    SELECT public.relatorio_tz_validado(p_tz) AS tz
  ),
  bounds AS MATERIALIZED (
    SELECT
      (p_de::timestamp AT TIME ZONE z.tz) AS inicio,
      ((p_ate + 1)::timestamp AT TIME ZONE z.tz) AS fim
    FROM z
  ),
  vendas_prod AS (
    SELECT
      p.id,
      p.nome,
      sum(iv.quantidade)::numeric AS total_quantidade,
      sum(iv.quantidade * iv.preco_unitario)::numeric AS total_valor
    FROM public.itens_venda iv
    INNER JOIN public.vendas v ON v.id = iv.venda_id
    INNER JOIN public.produtos p ON p.id = iv.produto_id
    CROSS JOIN bounds b
    WHERE v.status = 'CONCLUIDA'
      AND v.data >= b.inicio
      AND v.data < b.fim
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
$function$;
