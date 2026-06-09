-- 234 - Corrige escopo das RPCs de venda_eventos do painel gerente.
-- As funcoes da 231 sao SECURITY DEFINER; portanto precisam validar auth.uid()
-- antes de aceitar p_loja_id informado pelo cliente.

CREATE OR REPLACE FUNCTION public.assert_venda_eventos_gerente_scope(p_loja_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
BEGIN
  IF p_loja_id IS NULL THEN
    RAISE EXCEPTION 'VENDA_EVENTOS_LOJA_OBRIGATORIA' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'VENDA_EVENTOS_PERMISSAO_NEGADA' USING ERRCODE = '42501';
  END IF;

  SELECT u.perfil, u.loja_id
  INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'VENDA_EVENTOS_PERMISSAO_NEGADA' USING ERRCODE = '42501';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'VENDA_EVENTOS_PERMISSAO_NEGADA' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_venda_eventos_gerente_scope(uuid) FROM PUBLIC;

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_venda_eventos_gerente_scope(p_loja_id);

  RETURN QUERY
  SELECT
    e.id AS event_id,
    e.sale_id,
    e.event_type,
    e.occurred_at,
    e.total,
    e.total_bruto,
    e.forma_pagamento,
    e.caixa_id,
    e.operador_id,
    e.items,
    COALESCE((
      SELECT SUM((it->>'quantidade')::numeric)
      FROM jsonb_array_elements(e.items) AS it
    ), 0) AS qtd_itens_total,
    COALESCE(jsonb_array_length(e.items), 0) AS qtd_itens_distintos,
    e.items->0->>'nome' AS primeiro_produto
  FROM public.venda_eventos e
  WHERE e.loja_id = p_loja_id
    AND (p_inicio IS NULL OR e.occurred_at >= p_inicio)
    AND (p_fim IS NULL OR e.occurred_at <= p_fim)
    AND (p_event_types IS NULL OR e.event_type = ANY(p_event_types))
    AND (p_formas_pagamento IS NULL OR e.forma_pagamento = ANY(p_formas_pagamento))
  ORDER BY e.occurred_at DESC
  OFFSET GREATEST(p_offset, 0)
  LIMIT GREATEST(p_limit, 1);
END;
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_venda_eventos_gerente_scope(p_loja_id);

  RETURN QUERY
  SELECT
    COALESCE(SUM(e.total) FILTER (WHERE e.event_type = 'SALE_REGISTERED'), 0)::numeric(10,2) AS faturado,
    COUNT(*) FILTER (WHERE e.event_type = 'SALE_REGISTERED') AS qtd_concluidas,
    CASE
      WHEN COUNT(*) FILTER (WHERE e.event_type = 'SALE_REGISTERED') > 0 THEN
        ROUND(
          COALESCE(SUM(e.total) FILTER (WHERE e.event_type = 'SALE_REGISTERED'), 0)
          / COUNT(*) FILTER (WHERE e.event_type = 'SALE_REGISTERED'),
          2
        )
      ELSE 0::numeric(10,2)
    END AS ticket_medio,
    COUNT(*) FILTER (WHERE e.event_type = 'SALE_CANCELLED') AS qtd_canceladas,
    COALESCE(SUM(e.total) FILTER (WHERE e.event_type = 'SALE_CANCELLED'), 0)::numeric(10,2) AS valor_canceladas
  FROM public.venda_eventos e
  WHERE e.loja_id = p_loja_id
    AND (p_inicio IS NULL OR e.occurred_at >= p_inicio)
    AND (p_fim IS NULL OR e.occurred_at <= p_fim)
    AND (p_formas_pagamento IS NULL OR e.forma_pagamento = ANY(p_formas_pagamento));
END;
$$;

REVOKE ALL ON FUNCTION public.listar_venda_eventos_gerente(
  uuid, timestamptz, timestamptz, text[], text[], integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_venda_eventos_gerente(
  uuid, timestamptz, timestamptz, text[], text[], integer, integer
) TO authenticated;

REVOKE ALL ON FUNCTION public.kpis_venda_eventos_gerente(
  uuid, timestamptz, timestamptz, text[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpis_venda_eventos_gerente(
  uuid, timestamptz, timestamptz, text[]
) TO authenticated;
