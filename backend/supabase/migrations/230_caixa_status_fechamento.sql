-- 230 — RPC status único do caixa operador + fechamento idempotente.

CREATE OR REPLACE FUNCTION public.obter_status_caixa_operador(p_operador_id uuid DEFAULT NULL)
RETURNS TABLE (
  status text,
  caixa_id uuid,
  data_abertura timestamptz,
  valor_inicial numeric,
  valor_sistema_dinheiro numeric,
  blind_closure_enabled boolean,
  mensagem_operador text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_caixa record;
  v_valor_sistema numeric(10,2);
  v_blind boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'ERRO'::text, NULL::uuid, NULL::timestamptz, NULL::numeric, NULL::numeric, NULL::boolean,
      'Sessão expirada. Faça login novamente.'::text;
    RETURN;
  END IF;

  SELECT c.id, c.data_abertura, c.valor_inicial
  INTO v_caixa
  FROM public.caixas c
  WHERE c.operador_id = v_uid AND c.status = 'ABERTO'
  ORDER BY c.data_abertura DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'FECHADO'::text, NULL::uuid, NULL::timestamptz, NULL::numeric, NULL::numeric, NULL::boolean, NULL::text;
    RETURN;
  END IF;

  BEGIN
    v_valor_sistema := public.calcular_valor_sistema_dinheiro_caixa(v_caixa.id);
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'ERRO'::text, NULL::uuid, NULL::timestamptz, NULL::numeric, NULL::numeric, NULL::boolean,
      'Caixa indisponível no momento.'::text;
    RETURN;
  END;

  SELECT COALESCE(p.blind_closure, false) INTO v_blind FROM public.pdv_config p WHERE p.id = 1 LIMIT 1;

  RETURN QUERY SELECT
    'ABERTO'::text,
    v_caixa.id,
    v_caixa.data_abertura,
    COALESCE(v_caixa.valor_inicial, 0)::numeric,
    v_valor_sistema,
    v_blind,
    NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.obter_status_caixa_operador(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_status_caixa_operador(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obter_status_caixa_operador(uuid) TO service_role;

COMMENT ON FUNCTION public.obter_status_caixa_operador(uuid) IS
  'Status operacional único do caixa: ABERTO | FECHADO | ERRO.';

-- Fechamento idempotente: segundo clique retorna sucesso com o_ja_fechado = true.
CREATE OR REPLACE FUNCTION public.fechar_caixa_atomico(
  p_operador_id uuid,
  p_valor_contado numeric,
  p_motivo text DEFAULT ''
)
RETURNS TABLE (
  o_caixa_id uuid,
  o_valor_sistema numeric(10,2),
  o_valor_contado numeric(10,2),
  o_diferenca numeric(10,2),
  o_ja_fechado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caixa_id uuid;
  v_valor_sistema numeric(10,2);
  v_diferenca numeric(10,2);
  v_motivo text;
  v_fechado record;
  c_limite CONSTANT numeric := 5.00;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_SESSAO_EXPIRADA';
  END IF;
  IF v_uid <> p_operador_id THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_SEM_PERMISSAO';
  END IF;

  v_motivo := TRIM(COALESCE(p_motivo, ''));

  SELECT c.id INTO v_caixa_id
  FROM public.caixas c
  WHERE c.operador_id = p_operador_id AND c.status = 'ABERTO'
  ORDER BY c.data_abertura DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT c.id, c.valor_fechamento, c.fechamento_diferenca, c.data_fechamento
    INTO v_fechado
    FROM public.caixas c
    WHERE c.operador_id = p_operador_id AND c.status = 'FECHADO'
    ORDER BY c.data_fechamento DESC NULLS LAST, c.data_abertura DESC
    LIMIT 1;

    IF FOUND AND v_fechado.data_fechamento IS NOT NULL
       AND v_fechado.data_fechamento >= (now() - interval '24 hours') THEN
      RETURN QUERY SELECT
        v_fechado.id,
        ROUND(COALESCE(v_fechado.valor_fechamento, 0) - COALESCE(v_fechado.fechamento_diferenca, 0), 2)::numeric(10,2),
        COALESCE(v_fechado.valor_fechamento, ROUND(p_valor_contado, 2)),
        COALESCE(v_fechado.fechamento_diferenca, 0::numeric(10,2)),
        true;
      RETURN;
    END IF;

    RAISE EXCEPTION 'FECHAR_CAIXA_CAIXA_NAO_ENCONTRADO';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movimentacoes_caixa m
    WHERE m.caixa_id = v_caixa_id AND m.status = 'pendente' AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_MOVIMENTACOES_PENDENTES';
  END IF;

  v_valor_sistema := public.calcular_valor_sistema_dinheiro_caixa(v_caixa_id);
  v_diferenca := ROUND(p_valor_contado - v_valor_sistema, 2);

  IF ABS(v_diferenca) > c_limite AND LENGTH(v_motivo) < 5 THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_DIVERGENCIA_SEM_MOTIVO' USING DETAIL = v_diferenca::text;
  END IF;

  UPDATE public.caixas SET
    status = 'FECHADO',
    data_fechamento = now(),
    valor_fechamento = ROUND(p_valor_contado, 2),
    fechamento_diferenca = v_diferenca,
    fechamento_observacao = NULLIF(v_motivo, '')
  WHERE id = v_caixa_id;

  RETURN QUERY SELECT v_caixa_id, v_valor_sistema, ROUND(p_valor_contado, 2)::numeric(10,2), v_diferenca, false;
END;
$$;

REVOKE ALL ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) TO service_role;
