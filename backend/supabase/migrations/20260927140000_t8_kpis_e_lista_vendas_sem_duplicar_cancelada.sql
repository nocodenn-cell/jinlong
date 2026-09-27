-- T8 (auditoria Jinlong 2026-09-27): tela Vendas conta canceladas como
-- faturadas e lista a mesma venda em 2 linhas.
--
-- Resposta à pergunta obrigatória do plano ("a linha duplicada vem de uma
-- tabela de eventos ou de um join?"): de uma TABELA DE EVENTOS
-- (`venda_eventos`), não de um join. `listar_venda_eventos_gerente`
-- (20260707010000) devolve 1 LINHA POR EVENTO, e uma venda cancelada tem 2
-- eventos (SALE_REGISTERED + SALE_CANCELLED) com o mesmo sale_id — o caller
-- (`eventTypesFromFiltro` em app/gerente/vendas/actions.ts) inclui os dois
-- tipos quando o filtro de status está vazio ("Todos"), então os dois
-- aparecem como duas linhas. E `kpis_venda_eventos_gerente` soma `total`
-- de TODO evento SALE_REGISTERED, sem excluir os que depois ganharam um
-- SALE_CANCELLED — por isso o Faturado inclui vendas canceladas.
--
-- Query anterior (kpis_venda_eventos_gerente, 20260707010000):
--   SELECT COALESCE(SUM(e.total) FILTER (WHERE e.event_type = 'SALE_REGISTERED'), 0) AS faturado, ...
--   FROM public.venda_eventos e WHERE e.loja_id = p_loja_id AND ...
-- — sem nenhuma exclusão de sale_id que também tenha um evento SALE_CANCELLED.
--
-- Correção: as duas RPCs passam a operar sobre 1 linha por sale_id — o
-- EVENTO MAIS RECENTE de cada venda (que reflete o status atual: se foi
-- cancelada, o evento mais recente é SALE_CANCELLED). A data usada para
-- filtro de período e exibição continua sendo a do evento SALE_REGISTERED
-- (data original da venda) — mesmo critério que app/gerente/relatorios/vendas/actions.ts
-- já usa (filtra por `vendas.data`, avalia `vendas.status` atual), que é a
-- fonte com que a tela Vendas precisa bater (aceite do T8).
--
-- Efeito colateral corrigido de brinde: o filtro "status = Concluída" antes
-- incluía toda venda já registrada (mesmo as canceladas depois); agora só
-- inclui vendas cujo status atual é CONCLUIDA.

BEGIN;

CREATE OR REPLACE FUNCTION public.listar_venda_eventos_gerente(
  p_loja_id uuid,
  p_inicio timestamptz DEFAULT NULL,
  p_fim timestamptz DEFAULT NULL,
  p_event_types text[] DEFAULT ARRAY['SALE_REGISTERED'],
  p_formas_pagamento text[] DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 21
)
RETURNS TABLE (
  event_id uuid,
  sale_id uuid,
  event_type text,
  occurred_at timestamptz,
  total numeric,
  total_bruto numeric,
  forma_pagamento text,
  caixa_id uuid,
  operador_id uuid,
  items jsonb,
  qtd_itens_total numeric,
  qtd_itens_distintos integer,
  primeiro_produto text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH venda_status_atual AS (
    SELECT DISTINCT ON (e.sale_id)
      e.id AS event_id,
      e.sale_id,
      e.event_type,
      FIRST_VALUE(e.occurred_at) OVER (PARTITION BY e.sale_id ORDER BY e.occurred_at ASC) AS registrado_em,
      e.total,
      e.total_bruto,
      e.forma_pagamento,
      e.caixa_id,
      e.operador_id,
      e.items
    FROM public.venda_eventos e
    WHERE e.loja_id = p_loja_id
      AND (p_formas_pagamento IS NULL OR e.forma_pagamento = ANY(p_formas_pagamento))
    ORDER BY e.sale_id, e.occurred_at DESC
  )
  SELECT
    v.event_id,
    v.sale_id,
    v.event_type,
    v.registrado_em AS occurred_at,
    v.total,
    v.total_bruto,
    v.forma_pagamento,
    v.caixa_id,
    v.operador_id,
    v.items,
    COALESCE((
      SELECT SUM((it->>'quantidade')::numeric)
      FROM jsonb_array_elements(v.items) AS it
    ), 0) AS qtd_itens_total,
    COALESCE(jsonb_array_length(v.items), 0) AS qtd_itens_distintos,
    v.items->0->>'nome' AS primeiro_produto
  FROM venda_status_atual v
  WHERE (p_event_types IS NULL OR v.event_type = ANY(p_event_types))
    AND (p_inicio IS NULL OR v.registrado_em >= p_inicio)
    AND (p_fim IS NULL OR v.registrado_em <= p_fim)
  ORDER BY v.registrado_em DESC
  OFFSET GREATEST(p_offset, 0)
  LIMIT GREATEST(p_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.kpis_venda_eventos_gerente(
  p_loja_id uuid,
  p_inicio timestamptz DEFAULT NULL,
  p_fim timestamptz DEFAULT NULL,
  p_formas_pagamento text[] DEFAULT NULL
)
RETURNS TABLE (
  faturado numeric,
  qtd_concluidas bigint,
  ticket_medio numeric,
  qtd_canceladas bigint,
  valor_canceladas numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH venda_status_atual AS (
    SELECT DISTINCT ON (e.sale_id)
      e.sale_id,
      e.event_type,
      e.total,
      FIRST_VALUE(e.occurred_at) OVER (PARTITION BY e.sale_id ORDER BY e.occurred_at ASC) AS registrado_em
    FROM public.venda_eventos e
    WHERE e.loja_id = p_loja_id
      AND (p_formas_pagamento IS NULL OR e.forma_pagamento = ANY(p_formas_pagamento))
    ORDER BY e.sale_id, e.occurred_at DESC
  ),
  no_periodo AS (
    SELECT v.event_type, v.total
    FROM venda_status_atual v
    WHERE (p_inicio IS NULL OR v.registrado_em >= p_inicio)
      AND (p_fim IS NULL OR v.registrado_em <= p_fim)
  )
  SELECT
    COALESCE(SUM(total) FILTER (WHERE event_type = 'SALE_REGISTERED'), 0)::numeric(10,2) AS faturado,
    COUNT(*) FILTER (WHERE event_type = 'SALE_REGISTERED') AS qtd_concluidas,
    CASE
      WHEN COUNT(*) FILTER (WHERE event_type = 'SALE_REGISTERED') > 0 THEN
        ROUND(
          COALESCE(SUM(total) FILTER (WHERE event_type = 'SALE_REGISTERED'), 0)
          / COUNT(*) FILTER (WHERE event_type = 'SALE_REGISTERED'),
          2
        )
      ELSE 0::numeric(10,2)
    END AS ticket_medio,
    COUNT(*) FILTER (WHERE event_type = 'SALE_CANCELLED') AS qtd_canceladas,
    COALESCE(SUM(total) FILTER (WHERE event_type = 'SALE_CANCELLED'), 0)::numeric(10,2) AS valor_canceladas
  FROM no_periodo;
$$;

COMMENT ON FUNCTION public.listar_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[], text[], integer, integer) IS
  'T8 (2026-09-27): 1 linha por sale_id (status atual = evento mais recente), data de exibição/filtro = SALE_REGISTERED. Antes: 1 linha por evento, venda cancelada duplicava.';

COMMENT ON FUNCTION public.kpis_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[]) IS
  'T8 (2026-09-27): faturado/qtd_concluidas/ticket_medio só contam sale_id cujo status atual é SALE_REGISTERED (exclui canceladas). Antes: somava todo SALE_REGISTERED histórico, mesmo já cancelado.';

REVOKE ALL ON FUNCTION public.listar_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[], text[], integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[], text[], integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.kpis_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpis_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $verify_t8_venda_eventos$
DECLARE
  v_def_lista text;
  v_def_kpis text;
BEGIN
  v_def_lista := pg_get_functiondef(
    'public.listar_venda_eventos_gerente(uuid,timestamptz,timestamptz,text[],text[],integer,integer)'::regprocedure
  );
  v_def_kpis := pg_get_functiondef(
    'public.kpis_venda_eventos_gerente(uuid,timestamptz,timestamptz,text[])'::regprocedure
  );

  IF position('DISTINCT ON (e.sale_id)' IN v_def_lista) = 0 THEN
    RAISE EXCEPTION 'T8_LISTA_SEM_DEDUP_POR_VENDA';
  END IF;
  IF position('DISTINCT ON (e.sale_id)' IN v_def_kpis) = 0 THEN
    RAISE EXCEPTION 'T8_KPIS_SEM_DEDUP_POR_VENDA';
  END IF;

  IF NOT has_function_privilege('authenticated',
    'public.listar_venda_eventos_gerente(uuid,timestamptz,timestamptz,text[],text[],integer,integer)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T8_LISTA_GRANT_AUTH_PERDIDO';
  END IF;
  IF NOT has_function_privilege('authenticated',
    'public.kpis_venda_eventos_gerente(uuid,timestamptz,timestamptz,text[])'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'T8_KPIS_GRANT_AUTH_PERDIDO';
  END IF;
END
$verify_t8_venda_eventos$;

COMMIT;
