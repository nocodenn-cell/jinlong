-- BUG-4.4-DIAG-01: verificar_consistencia_venda — ambiguidade total_liquido
-- Causa: RETURNS TABLE cria variável OUT total_liquido (e venda_id) que colide
-- com colunas homônimas em SQL embutido do PL/pgSQL.
-- Escopo: somente diagnóstico. Invariantes e assinatura da função inalterados.

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
#variable_conflict use_column
DECLARE
  v_venda          record;
  v_item_count     bigint;
  v_evento_count   bigint;
  v_pag_count      bigint;
  v_pag_total      numeric;
  v_anomalias      text[] := '{}';
BEGIN
  SELECT v.id, v.status, v.total_liquido, v.created_at
  INTO v_venda
  FROM public.vendas v
  WHERE v.id = p_venda_id;

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
  FROM public.itens_venda iv
  WHERE iv.venda_id = p_venda_id;

  SELECT COUNT(*) INTO v_evento_count
  FROM public.venda_eventos ve
  WHERE ve.sale_id = p_venda_id AND ve.event_type = 'SALE_REGISTERED';

  SELECT COUNT(*), SUM(vp.valor) INTO v_pag_count, v_pag_total
  FROM public.vendas_pagamentos vp
  WHERE vp.venda_id = p_venda_id;

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
$$;

COMMENT ON FUNCTION public.verificar_consistencia_venda(uuid) IS
  'Verifica contrato de consistência de uma venda. Retorna anomalias[] vazio se OK. '
  'Colunas SQL qualificadas para evitar colisão com OUT params (BUG-4.4-DIAG-01).';
