-- Phase 2B: AP payments become atomic/idempotent realized-finance facts.
-- Cash leaves the drawer exclusively through the existing authorized sangria RPC.

BEGIN;

DROP FUNCTION IF EXISTS public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text);
DROP FUNCTION IF EXISTS public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text, text, uuid, text, text);

CREATE FUNCTION public.registrar_pagamento_contas_pagar(
  p_conta_id uuid,
  p_valor numeric,
  p_forma text,
  p_data timestamptz DEFAULT now(),
  p_observacao text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_caixa_id uuid DEFAULT NULL,
  p_origem text DEFAULT 'UI_FINANCEIRO',
  p_autorizacao_token text DEFAULT NULL
)
RETURNS TABLE(
  pagamento_id uuid,
  conta_id uuid,
  valor numeric,
  valor_pago numeric,
  status text,
  caixa_id uuid,
  movimentacao_caixa_id uuid,
  idempotent_replay boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_loja_usuario uuid;
  v_conta public.contas_pagar%ROWTYPE;
  v_pagamento public.contas_pagar_pagamentos%ROWTYPE;
  v_forma text := upper(btrim(COALESCE(p_forma, '')));
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_origem text := btrim(COALESCE(p_origem, ''));
  v_observacao text := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_caixa_id uuid := p_caixa_id;
  v_caixas_elegiveis integer;
  v_mov record;
  v_mov_key text;
  v_novo_pago numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'PAGAMENTO_AUTH'; END IF;

  SELECT u.loja_id INTO v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo = true
    AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND THEN RAISE EXCEPTION 'PAGAMENTO_PERFIL'; END IF;

  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> public.round_abnt(p_valor, 2) THEN
    RAISE EXCEPTION 'PAGAMENTO_VALOR_INVALIDO';
  END IF;
  IF v_key = '' THEN RAISE EXCEPTION 'PAGAMENTO_IDEMPOTENCY_KEY'; END IF;
  IF v_origem = '' THEN RAISE EXCEPTION 'PAGAMENTO_ORIGEM'; END IF;
  IF v_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO', 'BOLETO', 'TRANSF') THEN
    RAISE EXCEPTION 'PAGAMENTO_FORMA_INVALIDA';
  END IF;

  SELECT * INTO v_conta FROM public.contas_pagar cp
  WHERE cp.id = p_conta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAGAMENTO_CONTA_NAO_ENCONTRADA'; END IF;

  -- Phase 2B explicitly rejects every cross-store payment, including elevated profiles.
  IF v_conta.loja_id IS DISTINCT FROM v_loja_usuario THEN
    RAISE EXCEPTION 'PAGAMENTO_LOJA';
  END IF;

  SELECT cpp.* INTO v_pagamento
  FROM public.contas_pagar_pagamentos cpp
  WHERE cpp.conta_id = p_conta_id AND cpp.idempotency_key = v_key;

  IF FOUND THEN
    IF v_pagamento.valor <> p_valor
       OR v_pagamento.forma_pagamento <> v_forma
       OR v_pagamento.data_pagamento IS DISTINCT FROM COALESCE(p_data, v_pagamento.data_pagamento)
       OR v_pagamento.observacao IS DISTINCT FROM v_observacao
       OR v_pagamento.origem <> v_origem
       OR (p_caixa_id IS NOT NULL AND v_pagamento.caixa_id IS DISTINCT FROM p_caixa_id) THEN
      RAISE EXCEPTION 'PAGAMENTO_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN QUERY SELECT v_pagamento.id, v_pagamento.conta_id, v_pagamento.valor,
      v_conta.valor_pago, v_conta.status, v_pagamento.caixa_id,
      v_pagamento.movimentacao_caixa_id, true;
    RETURN;
  END IF;

  IF v_conta.status IN ('PAGO', 'CANCELADO') THEN RAISE EXCEPTION 'PAGAMENTO_CONTA_ENCERRADA'; END IF;
  IF p_valor > public.round_abnt(v_conta.valor_total - v_conta.valor_pago, 2) THEN
    RAISE EXCEPTION 'PAGAMENTO_EXCEDE_SALDO';
  END IF;

  IF v_forma = 'DINHEIRO' THEN
    IF v_caixa_id IS NULL THEN
      SELECT count(*), min(c.id::text)::uuid INTO v_caixas_elegiveis, v_caixa_id
      FROM public.caixas c
      WHERE c.loja_id = v_conta.loja_id AND c.status = 'ABERTO';
      IF v_caixas_elegiveis = 0 THEN RAISE EXCEPTION 'PAGAMENTO_CAIXA_ABERTO_OBRIGATORIO'; END IF;
      IF v_caixas_elegiveis > 1 THEN RAISE EXCEPTION 'PAGAMENTO_CAIXA_SELECAO_OBRIGATORIA'; END IF;
    END IF;

    PERFORM 1 FROM public.caixas c
    WHERE c.id = v_caixa_id AND c.loja_id = v_conta.loja_id AND c.status = 'ABERTO'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PAGAMENTO_CAIXA_INVALIDO'; END IF;
  ELSIF v_caixa_id IS NOT NULL THEN
    RAISE EXCEPTION 'PAGAMENTO_CAIXA_APENAS_DINHEIRO';
  END IF;

  INSERT INTO public.contas_pagar_pagamentos(
    conta_id, valor, forma_pagamento, data_pagamento, observacao, usuario_id,
    idempotency_key, origem, loja_id, caixa_id, operacao_tipo
  ) VALUES (
    p_conta_id, p_valor, v_forma, COALESCE(p_data, now()), v_observacao, v_uid,
    v_key, v_origem, v_conta.loja_id, v_caixa_id, 'PAGAMENTO'
  ) RETURNING * INTO v_pagamento;

  IF v_forma = 'DINHEIRO' THEN
    v_mov_key := 'ap:' || v_key;
    IF EXISTS (
      SELECT 1 FROM public.movimentacoes_caixa m
      WHERE m.caixa_id = v_caixa_id AND m.idempotency_key = v_mov_key
    ) THEN
      RAISE EXCEPTION 'PAGAMENTO_SANGRIA_CORRELACAO_EXISTENTE';
    END IF;
    SELECT * INTO v_mov FROM public.registrar_movimentacao(
      v_caixa_id, 'sangria', 'dinheiro', p_valor,
      'Pagamento AP ' || p_conta_id::text, 'PAGAMENTO_AP', NULL, NULL,
      v_mov_key, NULL, NULL, NULL, NULL, v_uid, NULL
    );

    IF v_mov.status_movimentacao = 'pendente' THEN
      IF NULLIF(btrim(COALESCE(p_autorizacao_token, '')), '') IS NULL THEN
        RAISE EXCEPTION 'PAGAMENTO_SANGRIA_AUTORIZACAO_OBRIGATORIA';
      END IF;
      PERFORM 1
      FROM public.tokens_desconto_gerente t
      JOIN public.usuarios aprovador ON aprovador.id = t.criado_por
      WHERE t.token = btrim(p_autorizacao_token)
        AND t.usado = false
        AND t.expira_em > now()
        AND t.loja_id = v_conta.loja_id::text
        AND aprovador.ativo = true
        AND aprovador.loja_id = v_conta.loja_id
        AND aprovador.perfil IN ('GERENTE', 'DONO', 'ADMIN')
      FOR UPDATE OF t;
      IF NOT FOUND THEN RAISE EXCEPTION 'PAGAMENTO_SANGRIA_AUTORIZACAO_INVALIDA'; END IF;
      SELECT * INTO v_mov FROM public.aprovar_movimentacao(
        v_mov.movimentacao_id, NULL, NULL, NULL, NULL, NULL, p_autorizacao_token
      );
    END IF;
    IF v_mov.status_movimentacao <> 'aprovado' THEN
      RAISE EXCEPTION 'PAGAMENTO_SANGRIA_NAO_APROVADA';
    END IF;

    UPDATE public.contas_pagar_pagamentos cpp
    SET movimentacao_caixa_id = v_mov.movimentacao_id
    WHERE cpp.id = v_pagamento.id
    RETURNING * INTO v_pagamento;
  END IF;

  v_novo_pago := public.round_abnt(v_conta.valor_pago + p_valor, 2);
  UPDATE public.contas_pagar cp
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago = cp.valor_total THEN 'PAGO' ELSE 'PARCIAL' END
  WHERE cp.id = p_conta_id;

  RETURN QUERY SELECT v_pagamento.id, v_pagamento.conta_id, v_pagamento.valor,
    v_novo_pago, CASE WHEN v_novo_pago = v_conta.valor_total THEN 'PAGO' ELSE 'PARCIAL' END,
    v_pagamento.caixa_id, v_pagamento.movimentacao_caixa_id, false;
END;
$function$;

COMMENT ON FUNCTION public.registrar_pagamento_contas_pagar(
  uuid, numeric, text, timestamptz, text, text, uuid, text, text
) IS 'SSOT AP: pagamento + saldo do titulo + sangria oficial para DINHEIRO, atomicos, autorizados e idempotentes.';

REVOKE ALL ON FUNCTION public.registrar_pagamento_contas_pagar(
  uuid, numeric, text, timestamptz, text, text, uuid, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_contas_pagar(
  uuid, numeric, text, timestamptz, text, text, uuid, text, text
) TO authenticated, service_role;

COMMIT;
