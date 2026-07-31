-- Correção de segurança crítica: bypass de autorização gerencial em movimentações de caixa.
--
-- Achado (certificação Go-Live, auditoria de caixa/permissões):
--   `registrar_movimentacao` e `aprovar_movimentacao` aceitavam `p_gerente_id` (um UUID
--   de qualquer GERENTE/DONO/ADMIN da loja) como PROVA de autorização, sem exigir senha
--   nem token. Esse UUID é trivialmente obtível (aparece em DTOs já expostos ao cliente,
--   ex. MovimentacaoCaixaDTO.gerenteId). Um operador comum, chamando a Server Action
--   diretamente (fora da UI, que nunca envia esse campo), autoriza sangria de qualquer
--   valor sem senha de gerente nenhuma — quebra total do modelo "gerente autoriza exceção".
--
-- Correção:
--   1. `registrar_movimentacao`: `p_status` só é honrado para `p_tipo = 'estorno'`
--      (único uso legítimo, chamado internamente por `estornar_movimentacao`). Para
--      sangria/suprimento o status é SEMPRE derivado da regra de negócio — nunca aceito
--      do chamador. `p_gerente_id` deixa de influenciar a aprovação de qualquer forma.
--   2. `aprovar_movimentacao`: token (`p_autorizacao_token`) passa a ser SEMPRE
--      obrigatório e validado/consumido (anti-replay). O aprovador registrado
--      (`gerente_id` da movimentação) vem de `tokens_desconto_gerente.criado_por` —
--      a fonte autoritativa de quem validou a senha — não mais do parâmetro
--      `p_gerente_id` enviado pelo chamador. `p_gerente_id` é mantido na assinatura só
--      por compatibilidade de chamada; deixou de ter qualquer efeito de autorização.
--
-- Nenhuma mudança de assinatura (mesmos parâmetros/tipos) — nenhum caller precisa mudar.
-- O fluxo real da UI (validarGerenteDesconto → token → autorizarMovimentacaoGerente) já
-- envia token válido hoje; continua funcionando sem alteração perceptível.

CREATE OR REPLACE FUNCTION public.registrar_movimentacao(
  p_caixa_id uuid,
  p_tipo text,
  p_forma_pagamento text,
  p_valor numeric,
  p_motivo text,
  p_motivo_codigo text DEFAULT 'OUTRO',
  p_status text DEFAULT NULL,
  p_movimentacao_origem_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL,
  p_operador_id uuid DEFAULT NULL,
  p_gerente_id uuid DEFAULT NULL
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
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_caixa record;
  v_origem record;
  v_movimentacao_id uuid;
  v_idempotency_key text := NULLIF(btrim(p_idempotency_key), '');
  v_status text;
  v_valor numeric(10,2);
  v_forma text;
  v_delta numeric(10,2) := 0;
  v_saldo_antes numeric(10,2);
  v_saldo_depois numeric(10,2);
  v_limite_sangria numeric(10,2) := 200;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_AUTH';
  END IF;

  IF p_tipo NOT IN ('suprimento', 'sangria', 'estorno') THEN
    RAISE EXCEPTION 'MOV_CAIXA_TIPO_INVALIDO';
  END IF;

  IF p_forma_pagamento NOT IN ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'outro') THEN
    RAISE EXCEPTION 'MOV_CAIXA_FORMA_INVALIDA';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'MOV_CAIXA_VALOR_INVALIDO';
  END IF;

  IF v_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_IDEMPOTENCY_KEY_OBRIGATORIA';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('pendente', 'aprovado', 'cancelado') THEN
    RAISE EXCEPTION 'MOV_CAIXA_STATUS_INVALIDO';
  END IF;

  SELECT c.id, c.status, c.saldo_atual, c.loja_id
  INTO v_caixa
  FROM public.caixas c
  WHERE c.id = p_caixa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MOV_CAIXA_CAIXA_NAO_ENCONTRADO';
  END IF;

  IF v_caixa.status <> 'ABERTO' THEN
    RAISE EXCEPTION 'MOV_CAIXA_FECHADO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.caixas c
    INNER JOIN public.usuarios u ON u.id = v_uid
    WHERE c.id = p_caixa_id
      AND c.loja_id = u.loja_id
      AND (
        c.operador_id = v_uid
        OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
      )
  ) THEN
    RAISE EXCEPTION 'MOV_CAIXA_SEM_PERMISSAO';
  END IF;

  -- `p_gerente_id`, quando informado, é validado só como formato/pertencimento à loja.
  -- NÃO autoriza nada por si só — ver correção de segurança no cabeçalho da migration.
  IF p_gerente_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios ug
      WHERE ug.id = p_gerente_id
        AND ug.loja_id = v_caixa.loja_id
        AND ug.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    ) THEN
      RAISE EXCEPTION 'MOV_CAIXA_GERENTE_INVALIDO';
    END IF;
  END IF;

  SELECT COALESCE(pc.limite_sangria_sem_gerente, 200)
  INTO v_limite_sangria
  FROM public.pdv_config pc
  WHERE pc.id = 1;

  IF p_tipo = 'estorno' THEN
    IF p_movimentacao_origem_id IS NULL THEN
      RAISE EXCEPTION 'MOV_CAIXA_ESTORNO_SEM_ORIGEM';
    END IF;

    SELECT
      m.id,
      m.caixa_id,
      m.tipo,
      m.forma_pagamento,
      m.valor,
      m.status
    INTO v_origem
    FROM public.movimentacoes_caixa m
    WHERE m.id = p_movimentacao_origem_id
      AND m.caixa_id = p_caixa_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MOV_CAIXA_ORIGEM_NAO_ENCONTRADA';
    END IF;

    IF v_origem.tipo = 'estorno' THEN
      RAISE EXCEPTION 'MOV_CAIXA_ESTORNO_DE_ESTORNO_NAO_PERMITIDO';
    END IF;

    IF v_origem.status <> 'aprovado' THEN
      RAISE EXCEPTION 'MOV_CAIXA_ESTORNO_ORIGEM_NAO_APROVADA';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.movimentacoes_caixa e
      WHERE e.movimentacao_origem_id = v_origem.id
        AND e.tipo = 'estorno'
        AND e.status IN ('pendente', 'aprovado')
    ) THEN
      RAISE EXCEPTION 'MOV_CAIXA_ORIGEM_JA_ESTORNADA';
    END IF;

    v_valor := v_origem.valor;
    v_forma := v_origem.forma_pagamento;
  ELSE
    IF p_movimentacao_origem_id IS NOT NULL THEN
      RAISE EXCEPTION 'MOV_CAIXA_ORIGEM_SO_PARA_ESTORNO';
    END IF;
    v_valor := ROUND(p_valor, 2);
    v_forma := p_forma_pagamento;
  END IF;

  IF p_tipo = 'sangria' AND v_forma <> 'dinheiro' THEN
    RAISE EXCEPTION 'MOV_CAIXA_SANGRIA_FORMA_INVALIDA';
  END IF;

  -- Correção de segurança: `p_status`/`p_gerente_id` não aprovam mais sangria/suprimento.
  -- Só `estorno` (chamado internamente por `estornar_movimentacao`, já validado ali)
  -- honra um `p_status` explícito. Sangria/suprimento têm o status SEMPRE derivado da
  -- regra de negócio — a única forma de aprovar sangria acima do limite é o fluxo real
  -- de `aprovar_movimentacao` com token de senha validada.
  IF p_tipo = 'estorno' THEN
    v_status := COALESCE(p_status, 'aprovado');
  ELSE
    v_status := CASE
      WHEN p_tipo = 'sangria' AND v_valor > v_limite_sangria THEN 'pendente'
      ELSE 'aprovado'
    END;
  END IF;

  v_saldo_antes := ROUND(COALESCE(v_caixa.saldo_atual, 0), 2);
  v_saldo_depois := v_saldo_antes;

  IF v_status = 'aprovado' THEN
    IF p_tipo = 'suprimento' THEN
      v_delta := CASE WHEN v_forma = 'dinheiro' THEN v_valor ELSE 0 END;
    ELSIF p_tipo = 'sangria' THEN
      v_delta := -v_valor;
    ELSIF p_tipo = 'estorno' THEN
      IF v_origem.tipo = 'sangria' THEN
        v_delta := v_valor;
      ELSIF v_origem.tipo = 'suprimento' AND v_origem.forma_pagamento = 'dinheiro' THEN
        v_delta := -v_valor;
      ELSE
        v_delta := 0;
      END IF;
    END IF;

    UPDATE public.caixas c
    SET saldo_atual = ROUND(c.saldo_atual + v_delta, 2)
    WHERE c.id = p_caixa_id
      AND (c.saldo_atual + v_delta) >= 0
    RETURNING c.saldo_atual INTO v_saldo_depois;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MOV_CAIXA_SALDO_INSUFICIENTE';
    END IF;
  END IF;

  INSERT INTO public.movimentacoes_caixa (
    caixa_id,
    operador_id,
    gerente_id,
    tipo,
    forma_pagamento,
    valor,
    motivo_codigo,
    motivo,
    status,
    movimentacao_origem_id,
    idempotency_key,
    saldo_antes,
    saldo_depois,
    ip_address,
    user_agent,
    device_id,
    terminal_id
  ) VALUES (
    p_caixa_id,
    v_uid,
    p_gerente_id,
    p_tipo,
    v_forma,
    v_valor,
    COALESCE(NULLIF(btrim(p_motivo_codigo), ''), 'OUTRO'),
    COALESCE(NULLIF(btrim(p_motivo), ''), 'Sem motivo informado'),
    v_status,
    p_movimentacao_origem_id,
    v_idempotency_key,
    v_saldo_antes,
    v_saldo_depois,
    p_ip_address,
    p_user_agent,
    p_device_id,
    p_terminal_id
  )
  RETURNING id INTO v_movimentacao_id;

  RETURN QUERY
  SELECT v_movimentacao_id, v_status, v_saldo_depois;

EXCEPTION
  WHEN unique_violation THEN
    IF EXISTS (
      SELECT 1
      FROM public.movimentacoes_caixa m
      WHERE m.caixa_id = p_caixa_id
        AND m.idempotency_key = v_idempotency_key
    ) THEN
      RETURN QUERY
      SELECT
        m.id,
        m.status,
        m.saldo_depois
      FROM public.movimentacoes_caixa m
      WHERE m.caixa_id = p_caixa_id
        AND m.idempotency_key = v_idempotency_key
      LIMIT 1;
      RETURN;
    END IF;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.registrar_movimentacao(
  uuid, text, text, numeric, text, text, text, uuid, text, inet, text, text, text, uuid, uuid
) IS
  'Registra sangria/suprimento/estorno. status de sangria/suprimento é sempre derivado da regra de negócio (p_status/p_gerente_id não aprovam mais nada) — aprovação de valor alto exige aprovar_movimentacao com token real.';

-- --------------------------------------------------------------------------
-- aprovar_movimentacao: token passa a ser sempre obrigatório; aprovador vem
-- de tokens_desconto_gerente.criado_por, não de p_gerente_id do chamador.
-- --------------------------------------------------------------------------

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

  -- Correção de segurança: token SEMPRE obrigatório. `p_gerente_id` NÃO é mais um
  -- caminho alternativo de autorização — era o bypass (qualquer UUID de gerente da
  -- loja aprovava, sem senha nenhuma). O aprovador gravado vem da própria linha do
  -- token (criado_por), fonte autoritativa de quem validou a senha na Edge Function.
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_TOKEN_OBRIGATORIO';
  END IF;

  SELECT t.criado_por
  INTO v_approved_by_uid
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

COMMENT ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid, text
) IS
  'Aprova movimentação pendente. Token de senha validada é SEMPRE obrigatório (anti-replay); aprovador vem de tokens_desconto_gerente.criado_por, não de p_gerente_id do chamador (que deixou de autorizar qualquer coisa).';
