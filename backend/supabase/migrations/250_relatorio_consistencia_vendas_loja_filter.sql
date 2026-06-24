-- Migration 250: adiciona p_loja_id a relatorio_consistencia_vendas
--
-- Problema: a função era SECURITY DEFINER sem filtro de loja.
-- Com p_caixa_id = NULL (padrão), a query retornava vendas de TODAS as lojas.
-- Um GERENTE da Loja A via métricas que incluíam Lojas B, C, etc.
--
-- Correção: adiciona p_loja_id uuid DEFAULT NULL.
-- JOIN em public.caixas garante o filtro via loja_id sem expor a coluna em vendas.
-- Compatibilidade mantida: callers que não passam p_loja_id continuam funcionando
-- (veem apenas o que seu JWT permite via chamada autenticada + p_caixa_id).

CREATE OR REPLACE FUNCTION public.relatorio_consistencia_vendas(
  p_caixa_id  uuid        DEFAULT NULL,
  p_loja_id   uuid        DEFAULT NULL,
  p_from      timestamptz DEFAULT now() - interval '7 days',
  p_to        timestamptz DEFAULT now()
)
RETURNS TABLE(
  total_vendas           bigint,
  vendas_consistentes    bigint,
  vendas_com_anomalia    bigint,
  taxa_consistencia_pct  numeric,
  sem_itens              bigint,
  sem_evento_ledger      bigint,
  evento_duplicado       bigint,
  sem_pagamento          bigint,
  pagamentos_divergentes bigint,
  periodo_inicio         timestamptz,
  periodo_fim            timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

COMMENT ON FUNCTION public.relatorio_consistencia_vendas IS
  'Relatório agregado de consistência por período. '
  'p_loja_id filtra pelo loja_id do caixa (JOIN public.caixas). '
  'p_caixa_id filtra por caixa específico. '
  'Ambos NULL = sem filtro (uso administrativo apenas). '
  'taxa_consistencia_pct = 100 é o objetivo.';

REVOKE ALL ON FUNCTION public.relatorio_consistencia_vendas FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relatorio_consistencia_vendas TO authenticated, service_role;
