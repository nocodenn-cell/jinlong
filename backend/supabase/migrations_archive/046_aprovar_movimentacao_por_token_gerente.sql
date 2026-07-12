-- Etapa 3.1: aprovação de movimentação pendente por token de gerente.
-- Objetivo:
-- - corrigir fluxo em que operador aprova com senha validada do gerente;
-- - manter compatibilidade futura com gerente_id real (Opção 2).

DROP FUNCTION IF EXISTS public.aprovar_movimentacao(
  uuid,
  inet,
  text,
  text,
  text,
  uuid
);

CREATE OR REPLACE FUNCTION public.aprovar_movimentacao(
  p_movimentacao_id uuid,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL,
  p_gerente_id uuid DEFAULT NULL,
  p_autorizacao_token text DEFAULT NULL
)
RETURNS TABLE (
  movimentacao_id uuid,
  status_movimentacao text,
  saldo_atual numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_uid uuid := auth.uid();
  v_mov record;
  v_caixa record;
  v_origem record;
  v_saldo_depois numeric(10,2);
  v_delta numeric(10,2) := 0;
  v_limite_sangria numeric(10,2) := 200;
  v_approved_by_uid uuid := NULL;
  v_token text := NULLIF(btrim(p_autorizacao_token), '');
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);

  IF v_requester_uid IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_AUTH';
  END IF;

  SELECT m.*
  INTO v_mov
  FROM public.movimentacoes_caixa m
  WHERE m.id = p_movimentacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_NAO_ENCONTRADA';
  END IF;

  IF v_mov.status <> 'pendente' THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_STATUS_INVALIDO';
  END IF;

  SELECT c.id, c.status, c.saldo_atual, c.loja_id
  INTO v_caixa
  FROM public.caixas c
  WHERE c.id = v_mov.caixa_id
  FOR UPDATE;

  IF NOT FOUND OR v_caixa.status <> 'ABERTO' THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_CAIXA_FECHADO';
  END IF;

  -- Quem solicita a aprovação deve pertencer à mesma loja e ter escopo no caixa.
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = v_requester_uid
      AND u.loja_id = v_caixa.loja_id
      AND (
        v_mov.operador_id = v_requester_uid
        OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
      )
  ) THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_SOLICITANTE_SEM_PERMISSAO';
  END IF;

  -- Caminho de aprovação atual (Opção 1): token emitido pela validar-gerente.
  -- Caminho futuro (Opção 2): gerente_id real.
  IF p_gerente_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = p_gerente_id
        AND u.loja_id = v_caixa.loja_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    ) THEN
      RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_SEM_PERMISSAO';
    END IF;
    v_approved_by_uid := p_gerente_id;
  ELSE
    IF v_token IS NULL THEN
      RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_TOKEN_OBRIGATORIO';
    END IF;

    PERFORM 1
    FROM public.tokens_desconto_gerente t
    WHERE t.token = v_token
      AND t.usado = false
      AND t.expira_em > now()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_TOKEN_INVALIDO';
    END IF;

    -- Proteção contra replay: token só pode ser consumido uma vez.
    UPDATE public.tokens_desconto_gerente
    SET usado = true
    WHERE token = v_token
      AND usado = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_TOKEN_INVALIDO';
    END IF;
  END IF;

  SELECT COALESCE(pc.limite_sangria_sem_gerente, 200)
  INTO v_limite_sangria
  FROM public.pdv_config pc
  WHERE pc.id = 1;

  IF v_mov.tipo = 'sangria' AND v_mov.valor > v_limite_sangria AND p_gerente_id IS NULL AND v_token IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_GERENTE_OBRIGATORIO';
  END IF;

  IF v_mov.tipo = 'estorno' THEN
    SELECT o.*
    INTO v_origem
    FROM public.movimentacoes_caixa o
    WHERE o.id = v_mov.movimentacao_origem_id
      AND o.caixa_id = v_mov.caixa_id
    FOR UPDATE;

    IF NOT FOUND OR v_origem.status <> 'aprovado' THEN
      RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_ESTORNO_ORIGEM_INVALIDA';
    END IF;
  END IF;

  IF v_mov.tipo = 'suprimento' THEN
    v_delta := CASE WHEN v_mov.forma_pagamento = 'dinheiro' THEN v_mov.valor ELSE 0 END;
  ELSIF v_mov.tipo = 'sangria' THEN
    v_delta := -v_mov.valor;
  ELSIF v_mov.tipo = 'estorno' THEN
    IF v_origem.tipo = 'sangria' THEN
      v_delta := v_mov.valor;
    ELSIF v_origem.tipo = 'suprimento' AND v_origem.forma_pagamento = 'dinheiro' THEN
      v_delta := -v_mov.valor;
    ELSE
      v_delta := 0;
    END IF;
  END IF;

  UPDATE public.caixas c
  SET saldo_atual = ROUND(c.saldo_atual + v_delta, 2)
  WHERE c.id = v_mov.caixa_id
    AND (c.saldo_atual + v_delta) >= 0
  RETURNING c.saldo_atual INTO v_saldo_depois;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_SALDO_INSUFICIENTE';
  END IF;

  UPDATE public.movimentacoes_caixa m
  SET
    status = 'aprovado',
    gerente_id = v_approved_by_uid,
    saldo_antes = v_mov.saldo_depois,
    saldo_depois = v_saldo_depois,
    ip_address = COALESCE(p_ip_address, m.ip_address),
    user_agent = COALESCE(p_user_agent, m.user_agent),
    device_id = COALESCE(p_device_id, m.device_id),
    terminal_id = COALESCE(p_terminal_id, m.terminal_id),
    updated_at = now()
  WHERE m.id = v_mov.id;

  RETURN QUERY
  SELECT v_mov.id, 'aprovado'::text, v_saldo_depois;
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid, text
) IS
  'Aprova movimentação pendente usando gerente_id (futuro) ou token validado da Edge (atual), com consumo anti-replay.';
