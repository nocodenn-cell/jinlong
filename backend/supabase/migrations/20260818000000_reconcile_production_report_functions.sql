-- =============================================================================
-- RECONCILIAÇÃO: Funções de relatório no estado atual de produção
-- =============================================================================
-- 
-- Contexto:
--   A migration 20260809163502 foi aplicada em produção (consta no ledger)
--   mas o arquivo correspondente NUNCA foi versionado no repositório.
--   
--   As funções de relatório foram alteradas em produção SEM registro
--   de migration, extraídas de pg_get_functiondef() em 2026-08-17.
--
-- Esta migration NÃO MUDA o banco de produção (já está aplicado).
-- Serve para que um rebuild do schema a partir do repositório
-- reproduza fielmente o estado atual de produção.
-- =============================================================================

-- =============================================================================
-- 1. relatorio_tz_validado - Normalização de fuso horário
-- =============================================================================
CREATE OR REPLACE FUNCTION public.relatorio_tz_validado(p_tz text)
 RETURNS text
 LANGUAGE sql
 STABLE COST 5000
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN p_tz IS NULL OR btrim(p_tz) = '' THEN 'America/Sao_Paulo'::text
    WHEN EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = p_tz) THEN p_tz
    ELSE 'America/Sao_Paulo'::text
  END;
$function$;

COMMENT ON FUNCTION public.relatorio_tz_validado(text) IS 
  'Normaliza nome IANA: vazio ou inválido → America/Sao_Paulo. STABLE (catálogo SO). COST alto: NÃO usar no predicado por linha — materializar uma vez (CTE MATERIALIZED / variável plpgsql) e filtrar por bounds timestamptz.';

-- =============================================================================
-- 2. relatorio_vendas_por_dia_periodo - Vendas por dia (otimizada)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.relatorio_vendas_por_dia_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo'::text
)
 RETURNS TABLE(
   dia date,
   num_vendas bigint,
   total_liquido numeric,
   ticket_medio numeric,
   total_desconto numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
$function$;

COMMENT ON FUNCTION public.relatorio_vendas_por_dia_periodo(date, date, text) IS
  'Vendas CONCLUIDAs por dia no período (fuso IANA). Bounds timestamptz materializados uma vez; predicado sargável em vendas.data.';

-- =============================================================================
-- 3. relatorio_top_produtos_periodo - Top produtos (otimizada)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.relatorio_top_produtos_periodo(
  p_de date,
  p_ate date,
  p_limite integer DEFAULT 50,
  p_tz text DEFAULT 'America/Sao_Paulo'::text
)
 RETURNS TABLE(
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
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
$function$;

COMMENT ON FUNCTION public.relatorio_top_produtos_periodo(date, date, integer, text) IS
  'Top produtos por faturamento no período (fuso IANA). Bounds timestamptz materializados uma vez; predicado sargável em vendas.data.';

-- =============================================================================
-- 4. relatorio_resumo_executivo_periodo - Resumo executivo
-- =============================================================================
CREATE OR REPLACE FUNCTION public.relatorio_resumo_executivo_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo'::text
)
 RETURNS TABLE(
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

COMMENT ON FUNCTION public.relatorio_resumo_executivo_periodo(date, date, text) IS
  'Resumo executivo do período: itens, vendas, cancelamentos, taxa, cobertura de custo, margem estimada. Versão reconciliada com produção em 2026-08-17.';

-- =============================================================================
-- 5. relatorio_margem_por_venda_periodo - Margem por venda
-- =============================================================================
CREATE OR REPLACE FUNCTION public.relatorio_margem_por_venda_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo'::text,
  p_limite integer DEFAULT 200
)
 RETURNS TABLE(
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

COMMENT ON FUNCTION public.relatorio_margem_por_venda_periodo(date, date, text, integer) IS
  'Margem estimada por venda no período, usando custo_unitario_snap da venda ou preco_custo do produto. Versão reconciliada com produção em 2026-08-17.';

-- =============================================================================
-- 6. relatorio_curva_abc_periodo - Curva ABC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.relatorio_curva_abc_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo'::text,
  p_limite integer DEFAULT 500
)
 RETURNS TABLE(
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
 SET search_path TO 'public', 'pg_catalog'
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

COMMENT ON FUNCTION public.relatorio_curva_abc_periodo(date, date, text, integer) IS
  'Curva ABC por faturamento no período. Classes: A=80%, B=95%, C=restante. Versão reconciliada com produção em 2026-08-17.';

-- =============================================================================
-- 7. relatorio_cobertura_estoque - Cobertura de estoque
-- =============================================================================
CREATE OR REPLACE FUNCTION public.relatorio_cobertura_estoque(
  p_dias_janela integer DEFAULT 30,
  p_limite integer DEFAULT 200
)
 RETURNS TABLE(
   produto_id uuid,
   nome text,
   loja_id uuid,
   quantidade_atual numeric,
   media_diaria_vendida numeric,
   dias_cobertura numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  WITH janela AS (
    SELECT GREATEST(1, LEAST(COALESCE(p_dias_janela, 30), 180)) AS dias
  ),
  vendas_recentes AS (
    SELECT
      iv.produto_id,
      c.loja_id,
      sum(iv.quantidade)::numeric AS qtd_total
    FROM public.itens_venda iv
    INNER JOIN public.vendas v ON v.id = iv.venda_id
    INNER JOIN public.caixas c ON c.id = v.caixa_id
    CROSS JOIN janela j
    WHERE v.status = 'CONCLUIDA'
      AND v.data >= now() - (j.dias || ' days')::interval
    GROUP BY iv.produto_id, c.loja_id
  )
  SELECT
    e.produto_id,
    p.nome,
    e.loja_id,
    e.quantidade_atual::numeric,
    (COALESCE(vr.qtd_total, 0) / j.dias)::numeric(14,4) AS media_diaria_vendida,
    CASE
      WHEN COALESCE(vr.qtd_total, 0) <= 0 THEN NULL
      ELSE (e.quantidade_atual::numeric / (vr.qtd_total / j.dias))::numeric(14,2)
    END AS dias_cobertura
  FROM public.estoque e
  INNER JOIN public.produtos p ON p.id = e.produto_id
  LEFT JOIN vendas_recentes vr ON vr.produto_id = e.produto_id AND vr.loja_id = e.loja_id
  CROSS JOIN janela j
  WHERE p.ativo = true
  ORDER BY dias_cobertura ASC NULLS LAST, e.quantidade_atual ASC
  LIMIT CASE
    WHEN p_limite IS NULL OR p_limite < 1 THEN 200
    WHEN p_limite > 500 THEN 500
    ELSE p_limite
  END;
$function$;

COMMENT ON FUNCTION public.relatorio_cobertura_estoque(integer, integer) IS
  'Cobertura de estoque: quantos dias o estoque atual dura com base na média diária de vendas. Janela ajustável de 1 a 180 dias.';

-- =============================================================================
-- 8. relatorio_consistencia_vendas - Consistência de vendas
-- =============================================================================
CREATE OR REPLACE FUNCTION public.relatorio_consistencia_vendas(
  p_caixa_id uuid DEFAULT NULL::uuid,
  p_loja_id uuid DEFAULT NULL::uuid,
  p_from timestamp with time zone DEFAULT (now() - '7 days'::interval),
  p_to timestamp with time zone DEFAULT now()
)
 RETURNS TABLE(
   total_vendas bigint,
   vendas_consistentes bigint,
   vendas_com_anomalia bigint,
   taxa_consistencia_pct numeric,
   sem_itens bigint,
   sem_evento_ledger bigint,
   evento_duplicado bigint,
   sem_pagamento bigint,
   pagamentos_divergentes bigint,
   periodo_inicio timestamp with time zone,
   periodo_fim timestamp with time zone
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH base AS (
  SELECT
    v.id,
    v.total_liquido,
    (SELECT COUNT(*) FROM public.itens_venda iv WHERE iv.venda_id = v.id)                    AS item_count,
    (SELECT COUNT(*) FROM public.venda_eventos ve
       WHERE ve.sale_id = v.id AND ve.event_type = 'SALE_REGISTERED')                        AS evento_count,
    (SELECT COUNT(*) FROM public.vendas_pagamentos vp WHERE vp.venda_id = v.id)              AS pag_count,
    (SELECT SUM(vp.valor) FROM public.vendas_pagamentos vp WHERE vp.venda_id = v.id)         AS pag_total
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE v.status = 'CONCLUIDA'
    AND v.created_at >= p_from
    AND v.created_at < p_to
    AND (p_caixa_id IS NULL OR v.caixa_id = p_caixa_id)
    AND (p_loja_id  IS NULL OR c.loja_id   = p_loja_id)
),
flags AS (
  SELECT
    id,
    (item_count = 0)                                          AS f_sem_itens,
    (evento_count = 0)                                        AS f_sem_evento,
    (evento_count > 1)                                        AS f_dup_evento,
    (pag_count = 0)                                           AS f_sem_pag,
    (ABS(COALESCE(pag_total, 0) - total_liquido) > 0.01)    AS f_pag_div,
    (
      item_count = 0 OR evento_count = 0 OR evento_count > 1
      OR pag_count = 0 OR ABS(COALESCE(pag_total, 0) - total_liquido) > 0.01
    )                                                         AS tem_anomalia
  FROM base
)
SELECT
  COUNT(*)::bigint                                           AS total_vendas,
  COUNT(*) FILTER (WHERE NOT tem_anomalia)::bigint           AS vendas_consistentes,
  COUNT(*) FILTER (WHERE tem_anomalia)::bigint               AS vendas_com_anomalia,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE NOT tem_anomalia) / NULLIF(COUNT(*), 0), 2
  )                                                          AS taxa_consistencia_pct,
  COUNT(*) FILTER (WHERE f_sem_itens)::bigint                AS sem_itens,
  COUNT(*) FILTER (WHERE f_sem_evento)::bigint               AS sem_evento_ledger,
  COUNT(*) FILTER (WHERE f_dup_evento)::bigint               AS evento_duplicado,
  COUNT(*) FILTER (WHERE f_sem_pag)::bigint                  AS sem_pagamento,
  COUNT(*) FILTER (WHERE f_pag_div)::bigint                  AS pagamentos_divergentes,
  p_from                                                     AS periodo_inicio,
  p_to                                                       AS periodo_fim
FROM flags;
$function$;

COMMENT ON FUNCTION public.relatorio_consistencia_vendas(uuid, uuid, timestamp with time zone, timestamp with time zone) IS
  'Auditoria de consistência de vendas: itens, ledger, pagamentos, anomalias. Período ajustável. SECURITY DEFINER para acesso a dados sensíveis.';

-- =============================================================================
-- 9. relatorio_produtos_sem_giro_periodo - Produtos sem venda no período
-- =============================================================================
CREATE OR REPLACE FUNCTION public.relatorio_produtos_sem_giro_periodo(
  p_loja_id uuid,
  p_data_inicio timestamp with time zone,
  p_data_fim timestamp with time zone
)
 RETURNS TABLE(
   produto_id uuid,
   nome text,
   codigo_barras text,
   quantidade_atual numeric,
   estoque_minimo numeric,
   preco_custo numeric,
   valor_imobilizado numeric,
   ultima_venda timestamp with time zone
 )
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF p_loja_id IS NULL THEN
    RAISE EXCEPTION 'loja_obrigatoria' USING ERRCODE = '22023';
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_inicio >= p_data_fim THEN
    RAISE EXCEPTION 'periodo_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT u.perfil, u.loja_id
    INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.codigo_barras,
    e.quantidade_atual::numeric(10,3),
    e.estoque_minimo::numeric(10,3),
    p.preco_custo,
    ROUND(e.quantidade_atual * COALESCE(p.preco_custo, 0), 2)::numeric(14,2) AS valor_imobilizado,
    uv.ultima_venda
  FROM public.estoque e
  JOIN public.produtos p ON p.id = e.produto_id
  LEFT JOIN LATERAL (
    SELECT MAX(v.data) AS ultima_venda
    FROM public.itens_venda iv
    JOIN public.vendas v ON v.id = iv.venda_id
    JOIN public.caixas c ON c.id = v.caixa_id
    WHERE iv.produto_id = e.produto_id
      AND c.loja_id = e.loja_id
      AND v.status = 'CONCLUIDA'
  ) uv ON true
  WHERE e.loja_id = p_loja_id
    AND e.quantidade_atual > 0
    AND p.ativo = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.itens_venda iv2
      JOIN public.vendas v2 ON v2.id = iv2.venda_id
      JOIN public.caixas c2 ON c2.id = v2.caixa_id
      WHERE iv2.produto_id = e.produto_id
        AND c2.loja_id = p_loja_id
        AND v2.status = 'CONCLUIDA'
        AND v2.data >= p_data_inicio
        AND v2.data < p_data_fim
    )
  ORDER BY valor_imobilizado DESC, p.nome ASC;
END;
$function$;

COMMENT ON FUNCTION public.relatorio_produtos_sem_giro_periodo(uuid, timestamp with time zone, timestamp with time zone) IS
  'Produtos com estoque positivo que não tiveram venda no período. Requer autenticação e perfil GERENTE/DONO/ADMIN. Inclui validação de loja.';

-- =============================================================================
-- 10. relatorio_settings_normalize_timezone - Trigger para timezone
-- =============================================================================
CREATE OR REPLACE FUNCTION public.relatorio_settings_normalize_timezone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  NEW.timezone := public.relatorio_tz_validado(NEW.timezone);
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.relatorio_settings_normalize_timezone() IS
  'Trigger para normalizar timezone em configurações de relatório usando relatorio_tz_validado.';

-- =============================================================================
-- FIM - Versão reconciliada com produção em 2026-08-17
-- =============================================================================