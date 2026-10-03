-- P-03 / UX-010 — Vendas: UMA linha por venda e KPIs de vendas (não de eventos).
--
-- Causa: `listar_venda_eventos_gerente` e `kpis_venda_eventos_gerente` liam `venda_eventos` (ledger append-only,
-- 1 linha por EVENTO). Uma venda cancelada tem 2 eventos (SALE_REGISTERED + SALE_CANCELLED, ambos com o total
-- original): a lista mostrava 2 linhas com o mesmo id e o KPI contava a venda em "concluídas/faturado" E em
-- "canceladas".
--
-- Correção: as duas RPCs mantêm nome, assinatura e colunas de retorno, mas passam a ler `vendas` (entidade; 1 linha =
-- 1 venda, status sempre correto). `venda_eventos` NÃO é alterado e segue como trilha/auditoria (Auditoria,
-- caixaVendaEspera). `p_event_types` continua aceitando 'SALE_REGISTERED'/'SALE_CANCELLED' (compatibilidade com
-- `eventTypesFromFiltro`); internamente mapeia para `vendas.status` ('CONCLUIDA'/'CANCELADA').
--
-- Regra temporal (decisão de produto):
--   * venda realizada / faturamento / concluídas ......... data da venda (`vendas.data`)
--   * cancelamento / valor cancelado ..................... data em que o cancelamento ocorreu
--   * a linha da venda mostra a data da venda; o instante do cancelamento fica em `vendas_canceladas_auditoria`.
--
-- Data do cancelamento (`cancelada_em`), em ordem de confiança:
--   1) `vendas_canceladas_auditoria.created_at` (UNIQUE por venda; gravada na MESMA transação que marca CANCELADA);
--   2) evento SALE_CANCELLED do ledger — ATENÇÃO: nos cancelamentos anteriores ao ledger o backfill gravou a data da
--      VENDA nesse campo; é só um recurso quando falta a auditoria;
--   3) `vendas.data`.
--   Em produção (consulta read-only de 2026-09-30) havia 2 vendas CANCELADA sem linha de auditoria: elas caem nos
--   níveis 2/3 até serem conferidas. NÃO há backfill nesta migration.
--
-- Segurança: SECURITY DEFINER e search_path preservados e o predicado de identidade da migration C1
-- (20260930090000) MANTIDO: `auth.role() = 'service_role' OR public.auth_usuario_gerencial_loja(p_loja_id)`.
-- A loja da venda vem de `caixas` (vendas não tem loja_id; em produção nenhuma venda tem caixa_id nulo).
-- Nenhum GRANT/REVOKE/RLS/tabela/índice novo (CREATE OR REPLACE preserva a ACL).
--
-- Idempotente: só CREATE OR REPLACE FUNCTION (mesma assinatura e colunas) + COMMENT; pode ser reexecutada.
-- Esta migration NÃO foi aplicada em nenhum ambiente.

BEGIN;

CREATE OR REPLACE FUNCTION public.listar_venda_eventos_gerente(
  p_loja_id uuid,
  p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_event_types text[] DEFAULT ARRAY['SALE_REGISTERED'::text],
  p_formas_pagamento text[] DEFAULT NULL::text[],
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 21
)
RETURNS TABLE(
  event_id uuid, sale_id uuid, event_type text, occurred_at timestamp with time zone,
  total numeric, total_bruto numeric, forma_pagamento text, caixa_id uuid, operador_id uuid,
  items jsonb, qtd_itens_total numeric, qtd_itens_distintos integer, primeiro_produto text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      v.id AS sale_id,
      v.status,
      v.data AS data_venda,
      COALESCE(a.created_at, ev.cancelada_ledger, v.data) AS cancelada_em,
      v.total_liquido,
      v.total_bruto,
      v.forma_pagamento,
      v.caixa_id,
      v.operador_id
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id
    LEFT JOIN public.vendas_canceladas_auditoria a ON a.venda_id = v.id
    LEFT JOIN LATERAL (
      SELECT min(e.occurred_at) AS cancelada_ledger
      FROM public.venda_eventos e
      WHERE e.sale_id = v.id AND e.event_type = 'SALE_CANCELLED'
    ) ev ON v.status = 'CANCELADA'
    WHERE c.loja_id = p_loja_id
      AND (auth.role() = 'service_role' OR public.auth_usuario_gerencial_loja(p_loja_id))
      AND (p_formas_pagamento IS NULL OR v.forma_pagamento = ANY(p_formas_pagamento))
  ), filtrada AS (
    SELECT b.*
    FROM base b
    WHERE
      -- vendas concluídas: pela data da venda
      (
        b.status = 'CONCLUIDA'
        AND (p_event_types IS NULL OR 'SALE_REGISTERED' = ANY(p_event_types))
        AND (p_inicio IS NULL OR b.data_venda >= p_inicio)
        AND (p_fim IS NULL OR b.data_venda <= p_fim)
      )
      OR
      -- vendas canceladas: aparecem pelo período do CANCELAMENTO; e também pelo período da venda quando o
      -- filtro pede concluídas+canceladas ("todas"). Uma única linha por venda, sem duplicar.
      (
        b.status = 'CANCELADA'
        AND (p_event_types IS NULL OR 'SALE_CANCELLED' = ANY(p_event_types))
        AND (
          (
            (p_inicio IS NULL OR b.cancelada_em >= p_inicio)
            AND (p_fim IS NULL OR b.cancelada_em <= p_fim)
          )
          OR (
            (p_event_types IS NULL OR 'SALE_REGISTERED' = ANY(p_event_types))
            AND (p_inicio IS NULL OR b.data_venda >= p_inicio)
            AND (p_fim IS NULL OR b.data_venda <= p_fim)
          )
        )
      )
  )
  SELECT
    f.sale_id AS event_id,
    f.sale_id,
    CASE WHEN f.status = 'CANCELADA' THEN 'SALE_CANCELLED' ELSE 'SALE_REGISTERED' END AS event_type,
    f.data_venda AS occurred_at,
    f.total_liquido AS total,
    f.total_bruto,
    f.forma_pagamento,
    f.caixa_id,
    f.operador_id,
    it.items,
    COALESCE((SELECT SUM((x->>'quantidade')::numeric) FROM jsonb_array_elements(it.items) AS x), 0) AS qtd_itens_total,
    COALESCE(jsonb_array_length(it.items), 0) AS qtd_itens_distintos,
    it.items->0->>'nome' AS primeiro_produto
  FROM filtrada f
  CROSS JOIN LATERAL (SELECT public.venda_eventos_items_from_sale(f.sale_id) AS items) it
  ORDER BY
    CASE
      WHEN f.status = 'CANCELADA' AND p_event_types IS NOT NULL AND NOT ('SALE_REGISTERED' = ANY(p_event_types))
        THEN f.cancelada_em
      ELSE f.data_venda
    END DESC,
    f.sale_id DESC
  OFFSET GREATEST(p_offset, 0)
  LIMIT GREATEST(p_limit, 1);
$function$;

CREATE OR REPLACE FUNCTION public.kpis_venda_eventos_gerente(
  p_loja_id uuid,
  p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_formas_pagamento text[] DEFAULT NULL::text[]
)
RETURNS TABLE(faturado numeric, qtd_concluidas bigint, ticket_medio numeric, qtd_canceladas bigint, valor_canceladas numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      v.status,
      v.data AS data_venda,
      COALESCE(a.created_at, ev.cancelada_ledger, v.data) AS cancelada_em,
      v.total_liquido
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id
    LEFT JOIN public.vendas_canceladas_auditoria a ON a.venda_id = v.id
    LEFT JOIN LATERAL (
      SELECT min(e.occurred_at) AS cancelada_ledger
      FROM public.venda_eventos e
      WHERE e.sale_id = v.id AND e.event_type = 'SALE_CANCELLED'
    ) ev ON v.status = 'CANCELADA'
    WHERE c.loja_id = p_loja_id
      AND (auth.role() = 'service_role' OR public.auth_usuario_gerencial_loja(p_loja_id))
      AND (p_formas_pagamento IS NULL OR v.forma_pagamento = ANY(p_formas_pagamento))
  ), concluidas AS (
    SELECT
      COALESCE(SUM(b.total_liquido), 0)::numeric(10,2) AS faturado,
      COUNT(*) AS qtd
    FROM base b
    WHERE b.status = 'CONCLUIDA'
      AND (p_inicio IS NULL OR b.data_venda >= p_inicio)
      AND (p_fim IS NULL OR b.data_venda <= p_fim)
  ), canceladas AS (
    SELECT
      COALESCE(SUM(b.total_liquido), 0)::numeric(10,2) AS valor,
      COUNT(*) AS qtd
    FROM base b
    WHERE b.status = 'CANCELADA'
      AND (p_inicio IS NULL OR b.cancelada_em >= p_inicio)
      AND (p_fim IS NULL OR b.cancelada_em <= p_fim)
  )
  SELECT
    c.faturado,
    c.qtd AS qtd_concluidas,
    CASE WHEN c.qtd > 0 THEN ROUND(c.faturado / c.qtd, 2) ELSE 0::numeric(10,2) END AS ticket_medio,
    x.qtd AS qtd_canceladas,
    x.valor AS valor_canceladas
  FROM concluidas c
  CROSS JOIN canceladas x;
$function$;

COMMENT ON FUNCTION public.listar_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[], text[], integer, integer) IS
  'P-03: 1 linha por VENDA (fonte = vendas), não por evento. Concluídas pela data da venda; canceladas pelo período do cancelamento (vendas_canceladas_auditoria) e, no filtro "todas", também pela data da venda. Mantém assinatura/colunas; p_event_types mapeia para vendas.status.';

COMMENT ON FUNCTION public.kpis_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[]) IS
  'P-03: KPIs de VENDAS. faturado/concluídas/ticket por data da venda (status CONCLUIDA); canceladas/valor cancelado por data do cancelamento.';

NOTIFY pgrst, 'reload schema';

COMMIT;
