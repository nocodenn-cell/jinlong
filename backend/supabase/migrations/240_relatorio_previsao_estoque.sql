-- 240_relatorio_previsao_estoque.sql
--
-- Bloco 4 ("evolução ERP real") — previsão simples de estoque ("dias restantes
-- de estoque"). Heurística simples: média diária de vendas concluídas numa
-- janela recente (padrão 30 dias, configurável) dividindo o estoque atual.
-- Sem ML, sem pipeline externo, sem sistema paralelo — leitura/agregação pura
-- sobre `estoque` + `itens_venda`/`vendas`/`caixas` (mesmo join já usado em
-- 100_dashboard_gerente_top_produto para obter loja_id a partir de vendas).
-- SECURITY INVOKER: respeita RLS multi-loja do usuário chamador.

CREATE OR REPLACE FUNCTION public.relatorio_previsao_estoque(
  p_dias_janela integer DEFAULT 30,
  p_limite integer DEFAULT 200
)
RETURNS TABLE (
  produto_id uuid,
  nome text,
  loja_id uuid,
  quantidade_atual numeric,
  media_diaria_vendida numeric(14,4),
  dias_restantes numeric(14,2)
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
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
    END AS dias_restantes
  FROM public.estoque e
  INNER JOIN public.produtos p ON p.id = e.produto_id
  LEFT JOIN vendas_recentes vr ON vr.produto_id = e.produto_id AND vr.loja_id = e.loja_id
  CROSS JOIN janela j
  WHERE p.ativo = true
  ORDER BY dias_restantes ASC NULLS LAST, e.quantidade_atual ASC
  LIMIT CASE
    WHEN p_limite IS NULL OR p_limite < 1 THEN 200
    WHEN p_limite > 500 THEN 500
    ELSE p_limite
  END;
$$;

COMMENT ON FUNCTION public.relatorio_previsao_estoque(integer, integer) IS
  'Previsão simples de "dias restantes de estoque" (heurística: estoque atual / média diária de vendas concluídas na janela). Sem ML, sem pipeline externo.';

GRANT EXECUTE ON FUNCTION public.relatorio_previsao_estoque(integer, integer) TO authenticated;
