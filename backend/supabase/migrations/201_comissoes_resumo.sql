-- RPC to aggregate commission data per salesperson
-- NOTE: table comissoes_vendedores is not yet created in any prior migration.
-- This function is safe to create ahead of time; it will error at runtime if
-- the table does not exist. Apply the comissoes_vendedores DDL migration first
-- (or together with this file) before calling this RPC.
CREATE OR REPLACE FUNCTION public.obter_resumo_comissoes_vendedores(
  p_loja_id   UUID,
  p_data_inicio DATE,
  p_data_fim    DATE
)
RETURNS TABLE (
  vendedor_id         UUID,
  vendedor_nome       TEXT,
  total_vendas_valor  NUMERIC,
  total_comissao      NUMERIC,
  quantidade_itens    BIGINT,
  quantidade_vendas   BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cv.vendedor_id,
    COALESCE(u.raw_user_meta_data->>'full_name', u.email, cv.vendedor_id::text) AS vendedor_nome,
    SUM(v.total_liquido)         AS total_vendas_valor,
    SUM(cv.valor_comissao_total) AS total_comissao,
    SUM(cv.quantidade)::BIGINT   AS quantidade_itens,
    COUNT(DISTINCT cv.venda_id)  AS quantidade_vendas
  FROM public.comissoes_vendedores cv
  JOIN public.vendas v ON v.id = cv.venda_id
  LEFT JOIN auth.users u ON u.id = cv.vendedor_id
  WHERE cv.loja_id = p_loja_id
    AND v.criado_em::date BETWEEN p_data_inicio AND p_data_fim
  GROUP BY cv.vendedor_id, u.raw_user_meta_data, u.email
  ORDER BY total_comissao DESC;
$$;

GRANT EXECUTE ON FUNCTION public.obter_resumo_comissoes_vendedores(UUID, DATE, DATE) TO authenticated;
