-- Contrato de autorização gerencial tipado para SANGRIA e PAGAMENTO AP.
--
-- PROBLEMA (comprovado contra o banco instalado):
--   `tokens_desconto_gerente` guarda apenas (token, expira_em, usado, loja_id,
--   criado_por). O emissor preenche `criado_por` com `authData.user.id` — o
--   usuário AUTENTICADO que pediu o token, ou seja, o OPERADOR solicitante
--   (em `sync-outbox` é literalmente NULL). Mesmo assim `aprovar_movimentacao`
--   fazia `gerente_id = t.criado_por`, registrando o solicitante como aprovador
--   da própria sangria.
--
--   Além disso o token não carregava finalidade nem alvo: um token emitido para
--   desconto aprovava uma sangria, e o token de uma sangria aprovava outra.
--   `aprovar_movimentacao` também não comparava a loja do token com a do caixa,
--   e não revalidava o aprovador no momento do consumo.
--
-- DECISÃO: tokens tipados vivem em uma TABELA SEPARADA. Assim os consumidores
-- legados (desconto da venda, limite de crédito, retomada de caixa) continuam
-- lendo `tokens_desconto_gerente` e simplesmente NÃO ENXERGAM tokens SANGRIA/AP:
-- a negação cruzada vira estrutural, sem reescrever aquelas funções (menor raio
-- de explosão). Na direção oposta, um token legado não existe na tabela nova e
-- também é negado.

CREATE TABLE IF NOT EXISTS public.tokens_autorizacao_operacao (
  token           text PRIMARY KEY,
  finalidade      text NOT NULL,
  alvo_id         text NOT NULL,
  loja_id         uuid NOT NULL REFERENCES public.lojas(id),
  gerente_id      uuid NOT NULL REFERENCES public.usuarios(id),
  solicitante_id  uuid REFERENCES public.usuarios(id),
  expira_em       timestamptz NOT NULL,
  usado           boolean NOT NULL DEFAULT false,
  usado_em        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tokens_autorizacao_operacao_finalidade_check
    CHECK (finalidade IN ('SANGRIA', 'PAGAMENTO_AP')),
  CONSTRAINT tokens_autorizacao_operacao_alvo_nao_vazio
    CHECK (btrim(alvo_id) <> '')
  -- Sem restrição de que solicitante <> gerente: em loja pequena o próprio
  -- gerente opera o caixa e autoriza a própria sangria, fluxo hoje suportado.
  -- O contrato exige REGISTRAR os dois papéis separadamente, não proibir que
  -- coincidam — proibir seria mudança de política e quebraria esse caso.
);

CREATE INDEX IF NOT EXISTS idx_tokens_autorizacao_operacao_expira_em
  ON public.tokens_autorizacao_operacao (expira_em);

-- Mesma postura da tabela legada: RLS ligada e NENHUMA policy. Só `service_role`
-- e funções SECURITY DEFINER alcançam a tabela; `anon`/`authenticated` não leem
-- nem escrevem token nenhum.
ALTER TABLE public.tokens_autorizacao_operacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tokens_autorizacao_operacao FROM PUBLIC;
REVOKE ALL ON public.tokens_autorizacao_operacao FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tokens_autorizacao_operacao TO service_role;

-- Consumo do token: valida e marca `usado` na mesma transação, fail-closed.
-- Revalida o gerente aprovador NO CONSUMO (não confia no estado da emissão):
-- precisa continuar ativo, com perfil aprovador e na mesma loja da operação.
CREATE OR REPLACE FUNCTION public.consumir_token_autorizacao_operacao(
  p_token text,
  p_finalidade text,
  p_alvo_id text,
  p_loja_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_token text := NULLIF(btrim(p_token), '');
  v_gerente uuid;
BEGIN
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'AUTORIZACAO_TOKEN_OBRIGATORIO';
  END IF;

  -- Finalidade fora do conjunto conhecido é negada explicitamente.
  IF p_finalidade IS NULL OR p_finalidade NOT IN ('SANGRIA', 'PAGAMENTO_AP') THEN
    RAISE EXCEPTION 'AUTORIZACAO_FINALIDADE_DESCONHECIDA';
  END IF;

  IF NULLIF(btrim(COALESCE(p_alvo_id, '')), '') IS NULL OR p_loja_id IS NULL THEN
    RAISE EXCEPTION 'AUTORIZACAO_ALVO_OBRIGATORIO';
  END IF;

  SELECT t.gerente_id
  INTO v_gerente
  FROM public.tokens_autorizacao_operacao t
  WHERE t.token = v_token
    AND t.finalidade = p_finalidade
    AND t.alvo_id = btrim(p_alvo_id)
    AND t.loja_id = p_loja_id
    AND t.usado = false
    AND t.expira_em > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTORIZACAO_TOKEN_INVALIDO';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios g
    WHERE g.id = v_gerente
      AND g.ativo = true
      AND g.loja_id = p_loja_id
      AND g.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'AUTORIZACAO_GERENTE_INVALIDO';
  END IF;

  -- Uso único: sob o FOR UPDATE acima duas transações concorrentes serializam e
  -- apenas a primeira encontra `usado = false`.
  UPDATE public.tokens_autorizacao_operacao
  SET usado = true, usado_em = now()
  WHERE token = v_token AND usado = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTORIZACAO_TOKEN_INVALIDO';
  END IF;

  RETURN v_gerente;
END;
$fn$;

REVOKE ALL ON FUNCTION public.consumir_token_autorizacao_operacao(text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consumir_token_autorizacao_operacao(text, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_token_autorizacao_operacao(text, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.aprovar_movimentacao(p_movimentacao_id uuid, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_terminal_id text DEFAULT NULL::text, p_gerente_id uuid DEFAULT NULL::uuid, p_autorizacao_token text DEFAULT NULL::text)
 RETURNS TABLE(movimentacao_id uuid, status_movimentacao text, saldo_atual numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_requester_uid uuid := auth.uid();
  v_mov record;
  v_caixa record;
  v_origem record;
  v_saldo_depois numeric(10,2);
  v_delta numeric(10,2) := 0;
  v_approved_by_uid uuid := NULL;
  v_token text := NULLIF(btrim(p_autorizacao_token), '');
  v_finalidade text;
  v_alvo_id text;
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

  -- Token SEMPRE obrigatório. `p_gerente_id` NÃO é caminho alternativo.
  --
  -- Mudança de contrato: o aprovador NÃO vem mais de
  -- `tokens_desconto_gerente.criado_por`. Aquele campo guarda o usuário
  -- AUTENTICADO que pediu o token (o operador solicitante — ver
  -- `validar-gerente/index.ts`, `tokenCreatedBy: authData.user.id`), e não o
  -- gerente que validou a senha. Gravá-lo em `gerente_id` registrava o
  -- solicitante como aprovador da própria sangria.
  --
  -- Agora o token é TIPADO e vive em `tokens_autorizacao_operacao`, vinculado a
  -- finalidade + alvo + loja + gerente aprovador. Finalidade e alvo são
  -- derivados AQUI, da própria linha da movimentação — nunca de dado do cliente.
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_TOKEN_OBRIGATORIO';
  END IF;

  IF v_mov.motivo_codigo = 'PAGAMENTO_AP' THEN
    -- Pagamento de contas a pagar: o token é emitido antes de a movimentação
    -- existir, então é vinculado à identidade estável da operação de pagamento
    -- ('ap:<conta_id>:<idempotency_key>') — exatamente a chave de idempotência
    -- que `registrar_pagamento_contas_pagar` grava na movimentação.
    v_finalidade := 'PAGAMENTO_AP';
    v_alvo_id := v_mov.idempotency_key;
  ELSE
    v_finalidade := 'SANGRIA';
    v_alvo_id := v_mov.id::text;
  END IF;

  v_approved_by_uid := public.consumir_token_autorizacao_operacao(
    v_token, v_finalidade, v_alvo_id, v_caixa.loja_id
  );

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
$function$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_contas_pagar(p_conta_id uuid, p_valor numeric, p_forma text, p_data timestamp with time zone DEFAULT now(), p_observacao text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_caixa_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT 'UI_FINANCEIRO'::text, p_autorizacao_token text DEFAULT NULL::text)
 RETURNS TABLE(pagamento_id uuid, conta_id uuid, valor numeric, valor_pago numeric, status text, caixa_id uuid, movimentacao_caixa_id uuid, idempotent_replay boolean)
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
    -- P1-3: a chave física carrega o mesmo escopo da chave lógica do AP
    -- (`conta_id`, `idempotency_key`). Sem isso, duas contas distintas com a
    -- mesma chave legítima no mesmo caixa colidiam e a segunda era recusada.
    v_mov_key := 'ap:' || p_conta_id::text || ':' || v_key;
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
      -- Pré-checagem tipada. O consumo efetivo acontece dentro de
      -- `aprovar_movimentacao`, na mesma transação, logo abaixo.
      -- Antes esta checagem lia `tokens_desconto_gerente` e tratava
      -- `criado_por` como aprovador — mas aquele campo é o operador solicitante.
      PERFORM 1
      FROM public.tokens_autorizacao_operacao t
      WHERE t.token = btrim(p_autorizacao_token)
        AND t.finalidade = 'PAGAMENTO_AP'
        AND t.alvo_id = v_mov_key
        AND t.loja_id = v_conta.loja_id
        AND t.usado = false
        AND t.expira_em > now();
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
