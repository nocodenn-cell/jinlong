-- Relatórios agregados por intervalo [p_inicio, p_fim_exclusive) em timestamptz (meia-aberta).

CREATE OR REPLACE FUNCTION public.relatorio_vendas_por_dia_periodo(
  p_inicio timestamptz,
  p_fim_exclusive timestamptz
)
RETURNS TABLE (
  dia timestamptz,
  num_vendas bigint,
  total_liquido numeric,
  ticket_medio numeric,
  total_desconto numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    date_trunc('day', v.data) AS dia,
    count(*)::bigint AS num_vendas,
    coalesce(sum(v.total_liquido), 0)::numeric AS total_liquido,
    coalesce(avg(v.total_liquido), 0)::numeric AS ticket_medio,
    coalesce(sum(v.total_desconto), 0)::numeric AS total_desconto
  FROM public.vendas v
  WHERE v.status = 'CONCLUIDA'
    AND v.data >= p_inicio
    AND v.data < p_fim_exclusive
  GROUP BY date_trunc('day', v.data)
  ORDER BY dia DESC;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_top_produtos_periodo(
  p_inicio timestamptz,
  p_fim_exclusive timestamptz,
  p_limite integer DEFAULT 50
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
SET search_path = public
AS $$
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
  WHERE v.status = 'CONCLUIDA'
    AND v.data >= p_inicio
    AND v.data < p_fim_exclusive
  GROUP BY p.id, p.nome, p.origem
  ORDER BY total_valor DESC NULLS LAST
  LIMIT CASE
    WHEN p_limite IS NULL OR p_limite < 1 THEN 50
    WHEN p_limite > 200 THEN 200
    ELSE p_limite
  END;
$$;

COMMENT ON FUNCTION public.relatorio_vendas_por_dia_periodo(timestamptz, timestamptz) IS
  'Vendas CONCLUIDAS agregadas por dia (date_trunc UTC) no intervalo [inicio, fim).';

COMMENT ON FUNCTION public.relatorio_top_produtos_periodo(timestamptz, timestamptz, integer) IS
  'Ranking de produtos no intervalo [inicio, fim); limite 1–200.';

GRANT EXECUTE ON FUNCTION public.relatorio_vendas_por_dia_periodo(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_top_produtos_periodo(timestamptz, timestamptz, integer) TO authenticated;
