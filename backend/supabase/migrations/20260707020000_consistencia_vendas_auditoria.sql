-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260707020000
-- name: consistencia_vendas_auditoria
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

-- Migration 244: Infraestrutura de consistência verificável das vendas
--
-- PROBLEMA: O sistema pode estar vendendo "certo" mas sem saber se está vendendo certo.
-- SOLUÇÃO: View de anomalias + função de verificação unitária + função de relatório.
--
-- CONTRATO DE CONSISTÊNCIA (venda CONCLUIDA):
--   1. Existe pelo menos 1 item em itens_venda
--   2. Existe exatamente 1 evento SALE_REGISTERED em venda_eventos
--   3. Existe pelo menos 1 pagamento em vendas_pagamentos
--   4. Soma dos pagamentos ≈ total_liquido (tolerância 0.01)
--
-- USO:
--   SELECT * FROM v_venda_consistencia_anomalias;                         -- todas com problema
--   SELECT * FROM verificar_consistencia_venda('uuid');                   -- diagnóstico unitário
--   SELECT * FROM relatorio_consistencia_vendas(null, now()-'7 days', now()); -- bulk 7 dias

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEW: anomalias de consistência (vendas CONCLUIDAS com lacunas)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_venda_consistencia_anomalias AS
SELECT
  v.id                                                          AS venda_id,
  v.caixa_id,
  v.operador_id,
  v.created_at,
  v.total_liquido,
  v.status,
  -- contagens
  items.item_count,
  eventos.evento_count,
  pagamentos.pagamento_count,
  pagamentos.pagamentos_total,
  -- flags de anomalia (true = problema)
  (items.item_count = 0)                                        AS sem_itens,
  (eventos.evento_count = 0)                                    AS sem_evento_ledger,
  (eventos.evento_count > 1)                                    AS evento_duplicado,
  (pagamentos.pagamento_count = 0)                              AS sem_pagamento,
  (ABS(COALESCE(pagamentos.pagamentos_total, 0) - v.total_liquido) > 0.01) AS pagamentos_divergentes
FROM public.vendas v
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS item_count
  FROM public.itens_venda iv
  WHERE iv.venda_id = v.id
) items ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS evento_count
  FROM public.venda_eventos ve
  WHERE ve.sale_id = v.id AND ve.event_type = 'SALE_REGISTERED'
) eventos ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS pagamento_count, SUM(vp.valor) AS pagamentos_total
  FROM public.vendas_pagamentos vp
  WHERE vp.venda_id = v.id
) pagamentos ON true
WHERE v.status = 'CONCLUIDA'
  AND (
    items.item_count = 0
    OR eventos.evento_count = 0
    OR eventos.evento_count > 1
    OR pagamentos.pagamento_count = 0
    OR ABS(COALESCE(pagamentos.pagamentos_total, 0) - v.total_liquido) > 0.01
  )

COMMENT ON VIEW public.v_venda_consistencia_anomalias IS
  'Vendas CONCLUIDAS com lacunas de consistência. Resultado vazio = sistema saudável.'

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: diagnóstico unitário de uma venda
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verificar_consistencia_venda(p_venda_id uuid)
RETURNS TABLE(
  venda_id        uuid,
  status_venda    text,
  consistente     boolean,
  anomalias       text[],
  item_count      bigint,
  evento_count    bigint,
  pagamento_count bigint,
  pagamentos_total numeric,
  total_liquido   numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_venda          record;
  v_item_count     bigint;
  v_evento_count   bigint;
  v_pag_count      bigint;
  v_pag_total      numeric;
  v_anomalias      text[] := '{}';
BEGIN
  SELECT id, status, total_liquido, created_at
  INTO v_venda
  FROM public.vendas
  WHERE id = p_venda_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      p_venda_id, 'NAO_ENCONTRADA'::text, false,
      ARRAY['venda_nao_encontrada']::text[],
      0::bigint, 0::bigint, 0::bigint, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  IF v_venda.status <> 'CONCLUIDA' THEN
    RETURN QUERY SELECT
      p_venda_id, v_venda.status::text, true,
      ARRAY[]::text[],
      0::bigint, 0::bigint, 0::bigint, NULL::numeric, v_venda.total_liquido;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_item_count
  FROM public.itens_venda WHERE venda_id = p_venda_id;

  SELECT COUNT(*) INTO v_evento_count
  FROM public.venda_eventos
  WHERE sale_id = p_venda_id AND event_type = 'SALE_REGISTERED';

  SELECT COUNT(*), SUM(valor) INTO v_pag_count, v_pag_total
  FROM public.vendas_pagamentos WHERE venda_id = p_venda_id;

  IF v_item_count = 0 THEN
    v_anomalias := v_anomalias || 'sem_itens';
  END IF;
  IF v_evento_count = 0 THEN
    v_anomalias := v_anomalias || 'sem_evento_ledger';
  END IF;
  IF v_evento_count > 1 THEN
    v_anomalias := v_anomalias || 'evento_duplicado';
  END IF;
  IF v_pag_count = 0 THEN
    v_anomalias := v_anomalias || 'sem_pagamento';
  END IF;
  IF ABS(COALESCE(v_pag_total, 0) - v_venda.total_liquido) > 0.01 THEN
    v_anomalias := v_anomalias || 'pagamentos_divergentes';
  END IF;

  RETURN QUERY SELECT
    p_venda_id,
    v_venda.status::text,
    (array_length(v_anomalias, 1) IS NULL)::boolean,
    v_anomalias,
    v_item_count,
    v_evento_count,
    v_pag_count,
    v_pag_total,
    v_venda.total_liquido;
END;
$$

COMMENT ON FUNCTION public.verificar_consistencia_venda IS
  'Verifica contrato de consistência de uma venda. Retorna anomalias[] vazio se OK.'

REVOKE ALL ON FUNCTION public.verificar_consistencia_venda FROM PUBLIC

GRANT EXECUTE ON FUNCTION public.verificar_consistencia_venda TO authenticated, service_role

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: relatório de consistência por período (responde "quantas falharam?")
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.relatorio_consistencia_vendas(
  p_caixa_id  uuid        DEFAULT NULL,
  p_from      timestamptz DEFAULT now() - interval '7 days',
  p_to        timestamptz DEFAULT now()
)
RETURNS TABLE(
  total_vendas          bigint,
  vendas_consistentes   bigint,
  vendas_com_anomalia   bigint,
  taxa_consistencia_pct numeric,
  sem_itens             bigint,
  sem_evento_ledger     bigint,
  evento_duplicado      bigint,
  sem_pagamento         bigint,
  pagamentos_divergentes bigint,
  periodo_inicio        timestamptz,
  periodo_fim           timestamptz
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
    (SELECT COUNT(*) FROM public.itens_venda iv WHERE iv.venda_id = v.id)          AS item_count,
    (SELECT COUNT(*) FROM public.venda_eventos ve
       WHERE ve.sale_id = v.id AND ve.event_type = 'SALE_REGISTERED')              AS evento_count,
    (SELECT COUNT(*) FROM public.vendas_pagamentos vp WHERE vp.venda_id = v.id)    AS pag_count,
    (SELECT SUM(vp.valor) FROM public.vendas_pagamentos vp WHERE vp.venda_id = v.id) AS pag_total
  FROM public.vendas v
  WHERE v.status = 'CONCLUIDA'
    AND v.created_at >= p_from
    AND v.created_at < p_to
    AND (p_caixa_id IS NULL OR v.caixa_id = p_caixa_id)
),
flags AS (
  SELECT
    id,
    (item_count = 0)                                         AS f_sem_itens,
    (evento_count = 0)                                       AS f_sem_evento,
    (evento_count > 1)                                       AS f_dup_evento,
    (pag_count = 0)                                          AS f_sem_pag,
    (ABS(COALESCE(pag_total, 0) - total_liquido) > 0.01)   AS f_pag_div,
    (
      item_count = 0 OR evento_count = 0 OR evento_count > 1
      OR pag_count = 0 OR ABS(COALESCE(pag_total, 0) - total_liquido) > 0.01
    )                                                        AS tem_anomalia
  FROM base
)
SELECT
  COUNT(*)::bigint                                          AS total_vendas,
  COUNT(*) FILTER (WHERE NOT tem_anomalia)::bigint          AS vendas_consistentes,
  COUNT(*) FILTER (WHERE tem_anomalia)::bigint              AS vendas_com_anomalia,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE NOT tem_anomalia) / NULLIF(COUNT(*), 0), 2
  )                                                         AS taxa_consistencia_pct,
  COUNT(*) FILTER (WHERE f_sem_itens)::bigint               AS sem_itens,
  COUNT(*) FILTER (WHERE f_sem_evento)::bigint              AS sem_evento_ledger,
  COUNT(*) FILTER (WHERE f_dup_evento)::bigint              AS evento_duplicado,
  COUNT(*) FILTER (WHERE f_sem_pag)::bigint                 AS sem_pagamento,
  COUNT(*) FILTER (WHERE f_pag_div)::bigint                 AS pagamentos_divergentes,
  p_from                                                    AS periodo_inicio,
  p_to                                                      AS periodo_fim
FROM flags;
$$

COMMENT ON FUNCTION public.relatorio_consistencia_vendas IS
  'Relatório agregado de consistência. taxa_consistencia_pct = 100 é o objetivo.'

REVOKE ALL ON FUNCTION public.relatorio_consistencia_vendas FROM PUBLIC

GRANT EXECUTE ON FUNCTION public.relatorio_consistencia_vendas TO authenticated, service_role