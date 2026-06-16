-- 242_relatorio_cobertura_estoque_reclassificacao.sql
--
-- Reclassificação semântica (não funcional) do módulo criado na migration 240.
--
-- 240 chamava o módulo de "previsão de estoque" (relatorio_previsao_estoque).
-- O cálculo em si é apenas um indicador derivado determinístico:
--   dias_cobertura = quantidade_atual / (média diária de vendas na janela)
-- Não é previsão probabilística, não infere comportamento, não decide nada.
-- O risco arquitetural não está no cálculo, e sim em tratá-lo como "verdade
-- futura" (reposição automática, alertas críticos automatizados, decisão de
-- compra). Para evitar essa expectativa errada, o módulo é rebatizado de
-- "previsão de estoque" para "cobertura de estoque (indicador histórico)".
--
-- GUARDRAIL ARQUITETURAL (impor a partir daqui):
--   "Indicadores derivados de histórico podem existir, mas não podem ser
--    classificados como previsão nem usados como sistema de decisão."
--   => continua sendo uma view analítica passiva (somente leitura). É proibido
--      automatizar qualquer ação (compra/reposição/alerta crítico) em cima
--      deste indicador.
--
-- Mudanças: nome da função e da coluna (dias_restantes -> dias_cobertura).
-- A lógica de cálculo permanece IDÊNTICA à 240 (estoque físico atual / média
-- histórica de vendas concluídas na janela). Nenhuma fonte de verdade nova:
-- estoque = tabela física `estoque`; vendas = `itens_venda`/`vendas`/`caixas`.

DROP FUNCTION IF EXISTS public.relatorio_previsao_estoque(integer, integer);

CREATE OR REPLACE FUNCTION public.relatorio_cobertura_estoque(
  p_dias_janela integer DEFAULT 30,
  p_limite integer DEFAULT 200
)
RETURNS TABLE (
  produto_id uuid,
  nome text,
  loja_id uuid,
  quantidade_atual numeric,
  media_diaria_vendida numeric(14,4),
  dias_cobertura numeric(14,2)
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
$$;

COMMENT ON FUNCTION public.relatorio_cobertura_estoque(integer, integer) IS
  'View analítica passiva: indicador histórico de cobertura de estoque (dias_cobertura = estoque físico atual / média diária de vendas concluídas na janela). Determinístico, NÃO preditivo, NÃO decisório. Proibido automatizar reposição/alertas/compra em cima deste indicador.';

GRANT EXECUTE ON FUNCTION public.relatorio_cobertura_estoque(integer, integer) TO authenticated;
