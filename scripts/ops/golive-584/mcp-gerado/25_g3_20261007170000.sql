-- golive-final-584 :: 20261007170000 ssot_002_mov_ar_ec_cache :: sha256 636de0ede04370c25747143b7515e37e3ba2c297528c30c37adbd82b709d7c8e
BEGIN;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '180s';
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007170000') THEN RAISE EXCEPTION 'GOLIVE_STOP: % já no histórico', '20261007170000'; END IF; END $g$;
-- SSOT-002 (fechamento) — sangria/suprimento/AR não decidem por saldo_atual.
-- Guard = E(c); cache = sincronizar_saldo_cache após o fato canônico.
-- Ver docs/regras-negocio/SSOT_CAIXA_SALDO_CONTRATO.md

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

  -- SSOT-002: autoridade E(c); saldo_atual só materializado após o fato.
  v_saldo_antes := ROUND(internal.valor_sistema_dinheiro(p_caixa_id), 2);
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

    IF v_delta < 0 AND (v_saldo_antes + v_delta) < 0 THEN
      RAISE EXCEPTION 'MOV_CAIXA_SALDO_INSUFICIENTE'
        USING DETAIL = format('valor_sistema=%s delta=%s', v_saldo_antes, v_delta);
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

  IF v_status = 'aprovado' THEN
    PERFORM internal.sincronizar_saldo_cache(p_caixa_id);
    SELECT ROUND(c.saldo_atual, 2) INTO v_saldo_depois FROM public.caixas c WHERE c.id = p_caixa_id;
    UPDATE public.movimentacoes_caixa m
       SET saldo_depois = v_saldo_depois
     WHERE m.id = v_movimentacao_id;
  END IF;

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
  'SSOT-002: sangria/suprimento/estorno. Guard e retorno usam E(c); saldo_atual materializado via sincronizar_saldo_cache.';

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
    -- O valor entra na identidade: sem isso o gerente aprovava "R$ 2" e o
    -- cliente efetivava qualquer quantia na mesma conta/chave, porque o alvo
    -- não amarrava o efeito financeiro. `valor` é numeric(10,2) e vem da linha
    -- da movimentação, que `authenticated` não consegue alterar (RLS).
    v_finalidade := 'PAGAMENTO_AP';
    v_alvo_id := v_mov.idempotency_key || ':' ||
                 trim(to_char(v_mov.valor, 'FM999999999990.00'));
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

  -- SSOT-002: guard por E(c); materializa cache após aprovar o fato.
  v_saldo_depois := ROUND(internal.valor_sistema_dinheiro(v_mov.caixa_id), 2);
  IF v_delta < 0 AND (v_saldo_depois + v_delta) < 0 THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_SALDO_INSUFICIENTE'
      USING DETAIL = format('valor_sistema=%s delta=%s', v_saldo_depois, v_delta);
  END IF;

  UPDATE public.movimentacoes_caixa m
  SET
    status = 'aprovado',
    gerente_id = v_approved_by_uid,
    saldo_antes = v_saldo_depois,
    saldo_depois = v_saldo_depois,
    ip_address = COALESCE(p_ip_address, m.ip_address),
    user_agent = COALESCE(p_user_agent, m.user_agent),
    device_id = COALESCE(p_device_id, m.device_id),
    terminal_id = COALESCE(p_terminal_id, m.terminal_id),
    updated_at = now()
  WHERE m.id = v_mov.id;

  PERFORM internal.sincronizar_saldo_cache(v_mov.caixa_id);
  SELECT ROUND(c.saldo_atual, 2) INTO v_saldo_depois FROM public.caixas c WHERE c.id = v_mov.caixa_id;
  UPDATE public.movimentacoes_caixa m SET saldo_depois = v_saldo_depois WHERE m.id = v_mov.id;

  RETURN QUERY
  SELECT v_mov.id, 'aprovado'::text, v_saldo_depois;
END;
$function$;


CREATE OR REPLACE FUNCTION public.registrar_liquidacao_receber(
  p_titulo_id uuid,
  p_valor numeric,
  p_forma_pagamento text,
  p_observacao text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_caixa_id uuid DEFAULT NULL,
  p_origem text DEFAULT 'UI_FINANCEIRO'
)
RETURNS TABLE(
  liquidacao_id uuid,
  titulo_id uuid,
  valor numeric,
  valor_aberto numeric,
  status text,
  caixa_id uuid,
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
  v_loja_titulo uuid;
  v_aberto numeric;
  v_status text;
  v_forma text := upper(btrim(COALESCE(p_forma_pagamento, '')));
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_origem text := btrim(COALESCE(p_origem, ''));
  v_observacao text := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_caixa_id uuid := p_caixa_id;
  v_caixas_elegiveis integer;
  v_liquidacao public.liquidacoes_receber%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'LIQUIDACAO_AUTH'; END IF;

  SELECT u.loja_id
  INTO v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid
    AND u.ativo = true
    AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND THEN RAISE EXCEPTION 'LIQUIDACAO_PERFIL'; END IF;

  IF p_valor IS NULL OR p_valor <= 0
     OR p_valor <> public.round_abnt(p_valor, 2) THEN
    RAISE EXCEPTION 'LIQUIDACAO_VALOR';
  END IF;
  IF v_key = '' THEN RAISE EXCEPTION 'LIQUIDACAO_IDEMPOTENCY_KEY'; END IF;
  IF v_origem = '' THEN RAISE EXCEPTION 'LIQUIDACAO_ORIGEM'; END IF;
  IF v_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'OUTROS') THEN
    RAISE EXCEPTION 'LIQUIDACAO_FORMA_PAGAMENTO';
  END IF;

  SELECT cr.valor_aberto, cr.loja_id, cr.status
  INTO v_aberto, v_loja_titulo, v_status
  FROM public.contas_receber cr
  WHERE cr.id = p_titulo_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LIQUIDACAO_TITULO'; END IF;

  -- P0-4: nenhum perfil liquida título de outra loja. Mesma regra do AP.
  IF v_loja_titulo IS DISTINCT FROM v_loja_usuario THEN
    RAISE EXCEPTION 'LIQUIDACAO_LOJA_DIVERGENTE';
  END IF;

  SELECT lr.* INTO v_liquidacao
  FROM public.liquidacoes_receber lr
  WHERE lr.titulo_id = p_titulo_id AND lr.idempotency_key = v_key;

  IF FOUND THEN
    IF v_liquidacao.valor <> p_valor
       OR v_liquidacao.forma_pagamento <> v_forma
       OR v_liquidacao.origem <> v_origem
       OR v_liquidacao.observacao IS DISTINCT FROM v_observacao
       OR (p_caixa_id IS NOT NULL AND v_liquidacao.caixa_id IS DISTINCT FROM p_caixa_id) THEN
      RAISE EXCEPTION 'LIQUIDACAO_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;

    RETURN QUERY SELECT
      v_liquidacao.id, v_liquidacao.titulo_id, v_liquidacao.valor,
      v_aberto, v_status, v_liquidacao.caixa_id, true;
    RETURN;
  END IF;

  IF p_valor > v_aberto THEN RAISE EXCEPTION 'LIQUIDACAO_EXCEDE_ABERTO'; END IF;

  IF v_forma = 'DINHEIRO' THEN
    IF v_caixa_id IS NULL THEN
      SELECT count(*), min(c.id::text)::uuid
      INTO v_caixas_elegiveis, v_caixa_id
      FROM public.caixas c
      WHERE c.loja_id = v_loja_titulo AND c.status = 'ABERTO';

      IF v_caixas_elegiveis = 0 THEN RAISE EXCEPTION 'LIQUIDACAO_CAIXA_ABERTO_OBRIGATORIO'; END IF;
      IF v_caixas_elegiveis > 1 THEN RAISE EXCEPTION 'LIQUIDACAO_CAIXA_SELECAO_OBRIGATORIA'; END IF;
    END IF;

    PERFORM 1 FROM public.caixas c
    WHERE c.id = v_caixa_id
      AND c.loja_id = v_loja_titulo
      AND c.status = 'ABERTO'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LIQUIDACAO_CAIXA_INVALIDO'; END IF;
  ELSIF v_caixa_id IS NOT NULL THEN
    RAISE EXCEPTION 'LIQUIDACAO_CAIXA_APENAS_DINHEIRO';
  END IF;

  INSERT INTO public.liquidacoes_receber (
    titulo_id, valor, forma_pagamento, observacao, created_by,
    idempotency_key, origem, loja_id, caixa_id, operacao_tipo
  ) VALUES (
    p_titulo_id, p_valor, v_forma, v_observacao, v_uid,
    v_key, v_origem, v_loja_titulo, v_caixa_id, 'RECEBIMENTO'
  ) RETURNING * INTO v_liquidacao;

  v_aberto := public.round_abnt(v_aberto - p_valor, 2);
  v_status := CASE WHEN v_aberto = 0 THEN 'QUITADO' ELSE 'PARCIAL' END;

  UPDATE public.contas_receber cr
  SET valor_aberto = v_aberto, status = v_status
  WHERE cr.id = p_titulo_id;

  IF v_forma = 'DINHEIRO' THEN
    -- Fato já em liquidacoes_receber; E(c) inclui o recebimento — só materializa cache.
    PERFORM internal.sincronizar_saldo_cache(v_caixa_id);
  END IF;

  RETURN QUERY SELECT
    v_liquidacao.id, v_liquidacao.titulo_id, v_liquidacao.valor,
    v_aberto, v_status, v_liquidacao.caixa_id, false;
END;
$function$;


COMMENT ON FUNCTION public.registrar_liquidacao_receber(
  uuid, numeric, text, text, text, uuid, text
) IS 'SSOT-002/AR: liquidação + materialização de E(c) no cache (sem UPDATE incremental de saldo_atual).';

CREATE OR REPLACE FUNCTION public.estornar_liquidacao_receber(
  p_liquidacao_id uuid,
  p_motivo text,
  p_idempotency_key text,
  p_origem text DEFAULT 'UI_FINANCEIRO'
)
RETURNS TABLE(
  estorno_id uuid,
  liquidacao_origem_id uuid,
  titulo_id uuid,
  valor numeric,
  valor_aberto numeric,
  status text,
  caixa_id uuid,
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
  v_orig public.liquidacoes_receber%ROWTYPE;
  v_estorno public.liquidacoes_receber%ROWTYPE;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_origem text := btrim(COALESCE(p_origem, ''));
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_loja_titulo uuid;
  v_aberto numeric;
  v_total numeric;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ESTORNO_AR_AUTH'; END IF;

  SELECT u.loja_id INTO v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo = true
    AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AR_PERFIL'; END IF;

  IF v_key = '' THEN RAISE EXCEPTION 'ESTORNO_AR_IDEMPOTENCY_KEY'; END IF;
  IF v_origem = '' THEN RAISE EXCEPTION 'ESTORNO_AR_ORIGEM'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'ESTORNO_AR_MOTIVO'; END IF;

  SELECT * INTO v_orig FROM public.liquidacoes_receber lr
  WHERE lr.id = p_liquidacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AR_LIQUIDACAO_NAO_ENCONTRADA'; END IF;

  IF COALESCE(v_orig.operacao_tipo, 'RECEBIMENTO') <> 'RECEBIMENTO' THEN
    RAISE EXCEPTION 'ESTORNO_AR_ORIGEM_NAO_E_RECEBIMENTO';
  END IF;

  SELECT cr.loja_id, cr.valor_aberto, cr.valor_total
  INTO v_loja_titulo, v_aberto, v_total
  FROM public.contas_receber cr WHERE cr.id = v_orig.titulo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AR_TITULO'; END IF;

  IF v_loja_titulo IS DISTINCT FROM v_loja_usuario THEN
    RAISE EXCEPTION 'ESTORNO_AR_LOJA_DIVERGENTE';
  END IF;

  -- Replay pela mesma chave devolve o fato já criado.
  SELECT * INTO v_estorno FROM public.liquidacoes_receber lr
  WHERE lr.titulo_id = v_orig.titulo_id AND lr.idempotency_key = v_key;
  IF FOUND THEN
    IF v_estorno.operacao_origem_id IS DISTINCT FROM p_liquidacao_id THEN
      RAISE EXCEPTION 'ESTORNO_AR_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN QUERY SELECT v_estorno.id, v_estorno.operacao_origem_id, v_estorno.titulo_id,
      v_estorno.valor, v_aberto, (SELECT cr.status FROM public.contas_receber cr
        WHERE cr.id = v_orig.titulo_id), v_estorno.caixa_id, true;
    RETURN;
  END IF;

  -- Um recebimento só pode ser estornado uma vez.
  IF EXISTS (SELECT 1 FROM public.liquidacoes_receber lr
             WHERE lr.operacao_origem_id = p_liquidacao_id) THEN
    RAISE EXCEPTION 'ESTORNO_AR_JA_ESTORNADO';
  END IF;

  IF public.round_abnt(v_aberto + v_orig.valor, 2) > v_total THEN
    RAISE EXCEPTION 'ESTORNO_AR_EXCEDE_TITULO';
  END IF;

  -- Efeito físico apenas para dinheiro: sai da gaveta de volta para o cliente.
  IF v_orig.forma_pagamento = 'DINHEIRO' THEN
    IF v_orig.caixa_id IS NULL THEN RAISE EXCEPTION 'ESTORNO_AR_CAIXA_ORIGEM_AUSENTE'; END IF;
    PERFORM 1 FROM public.caixas c
    WHERE c.id = v_orig.caixa_id AND c.loja_id = v_loja_titulo AND c.status = 'ABERTO'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AR_CAIXA_INVALIDO'; END IF;
  END IF;

  INSERT INTO public.liquidacoes_receber (
    titulo_id, valor, forma_pagamento, observacao, created_by,
    idempotency_key, origem, loja_id, caixa_id, operacao_tipo, operacao_origem_id
  ) VALUES (
    v_orig.titulo_id, v_orig.valor, v_orig.forma_pagamento, v_motivo, v_uid,
    v_key, v_origem, v_loja_titulo, v_orig.caixa_id, 'ESTORNO', p_liquidacao_id
  ) RETURNING * INTO v_estorno;

  v_aberto := public.round_abnt(v_aberto + v_orig.valor, 2);
  v_status := CASE WHEN v_aberto >= v_total THEN 'ABERTO' ELSE 'PARCIAL' END;
  UPDATE public.contas_receber cr
  SET valor_aberto = v_aberto, status = v_status
  WHERE cr.id = v_orig.titulo_id;

  IF v_orig.forma_pagamento = 'DINHEIRO' THEN
    -- Guard por E(c) ANTES do fato de estorno já inserido acima: o INSERT já
    -- entrou em liquidacoes; E(c) já descontou. Se E(c) ficou negativo, falha
    -- e a TX desfaz o INSERT.
    IF internal.valor_sistema_dinheiro(v_orig.caixa_id) < 0 THEN
      RAISE EXCEPTION 'ESTORNO_AR_SALDO_INSUFICIENTE'
        USING DETAIL = format('valor_sistema=%s', internal.valor_sistema_dinheiro(v_orig.caixa_id));
    END IF;
    PERFORM internal.sincronizar_saldo_cache(v_orig.caixa_id);
  END IF;

  RETURN QUERY SELECT v_estorno.id, v_estorno.operacao_origem_id, v_estorno.titulo_id,
    v_estorno.valor, v_aberto, v_status, v_estorno.caixa_id, false;
END;
$function$;


COMMENT ON FUNCTION public.estornar_liquidacao_receber(uuid, text, text, text) IS
  'SSOT-002: estorno AR; guard pós-fato por E(c)<0; cache via sincronizar_saldo_cache.';


DO $prova$
DECLARE
  r text; a text; l text; e text;
BEGIN
  SELECT pg_get_functiondef('public.registrar_movimentacao(uuid,text,text,numeric,text,text,text,uuid,text,inet,text,text,text,uuid,uuid)'::regprocedure) INTO r;
  IF strpos(r, 'saldo_atual = ROUND(c.saldo_atual + v_delta') > 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: registrar_movimentacao ainda incrementa saldo_atual';
  END IF;
  IF strpos(r, 'sincronizar_saldo_cache') = 0 OR strpos(r, 'valor_sistema_dinheiro') = 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: registrar_movimentacao sem E(c)/sync';
  END IF;

  SELECT pg_get_functiondef('public.aprovar_movimentacao(uuid,inet,text,text,text,uuid,text)'::regprocedure) INTO a;
  IF strpos(a, 'saldo_atual = ROUND(c.saldo_atual + v_delta') > 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: aprovar_movimentacao ainda incrementa saldo_atual';
  END IF;
  IF strpos(a, 'sincronizar_saldo_cache') = 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: aprovar_movimentacao sem sync';
  END IF;

  SELECT pg_get_functiondef('public.registrar_liquidacao_receber(uuid,numeric,text,text,text,uuid,text)'::regprocedure) INTO l;
  IF strpos(l, 'saldo_atual = public.round_abnt') > 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: liquidacao ainda UPDATE saldo_atual';
  END IF;
  IF strpos(l, 'sincronizar_saldo_cache') = 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: liquidacao sem sync';
  END IF;

  SELECT pg_get_functiondef('public.estornar_liquidacao_receber(uuid,text,text,text)'::regprocedure) INTO e;
  IF strpos(e, 'SET saldo_atual = public.round_abnt') > 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: estorno AR ainda UPDATE saldo_atual';
  END IF;
  IF strpos(e, 'sincronizar_saldo_cache') = 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: estorno AR sem sync';
  END IF;

  RAISE NOTICE 'SSOT-002 PROVA ESTRUTURAL OK (mov/AR)';
END
$prova$;

NOTIFY pgrst, 'reload schema';
;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261007170000', 'ssot_002_mov_ar_ec_cache', ARRAY[$golive_stmt_636de0ede043$-- SSOT-002 (fechamento) — sangria/suprimento/AR não decidem por saldo_atual.
-- Guard = E(c); cache = sincronizar_saldo_cache após o fato canônico.
-- Ver docs/regras-negocio/SSOT_CAIXA_SALDO_CONTRATO.md

BEGIN;
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

  -- SSOT-002: autoridade E(c); saldo_atual só materializado após o fato.
  v_saldo_antes := ROUND(internal.valor_sistema_dinheiro(p_caixa_id), 2);
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

    IF v_delta < 0 AND (v_saldo_antes + v_delta) < 0 THEN
      RAISE EXCEPTION 'MOV_CAIXA_SALDO_INSUFICIENTE'
        USING DETAIL = format('valor_sistema=%s delta=%s', v_saldo_antes, v_delta);
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

  IF v_status = 'aprovado' THEN
    PERFORM internal.sincronizar_saldo_cache(p_caixa_id);
    SELECT ROUND(c.saldo_atual, 2) INTO v_saldo_depois FROM public.caixas c WHERE c.id = p_caixa_id;
    UPDATE public.movimentacoes_caixa m
       SET saldo_depois = v_saldo_depois
     WHERE m.id = v_movimentacao_id;
  END IF;

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
  'SSOT-002: sangria/suprimento/estorno. Guard e retorno usam E(c); saldo_atual materializado via sincronizar_saldo_cache.';

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
    -- O valor entra na identidade: sem isso o gerente aprovava "R$ 2" e o
    -- cliente efetivava qualquer quantia na mesma conta/chave, porque o alvo
    -- não amarrava o efeito financeiro. `valor` é numeric(10,2) e vem da linha
    -- da movimentação, que `authenticated` não consegue alterar (RLS).
    v_finalidade := 'PAGAMENTO_AP';
    v_alvo_id := v_mov.idempotency_key || ':' ||
                 trim(to_char(v_mov.valor, 'FM999999999990.00'));
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

  -- SSOT-002: guard por E(c); materializa cache após aprovar o fato.
  v_saldo_depois := ROUND(internal.valor_sistema_dinheiro(v_mov.caixa_id), 2);
  IF v_delta < 0 AND (v_saldo_depois + v_delta) < 0 THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_SALDO_INSUFICIENTE'
      USING DETAIL = format('valor_sistema=%s delta=%s', v_saldo_depois, v_delta);
  END IF;

  UPDATE public.movimentacoes_caixa m
  SET
    status = 'aprovado',
    gerente_id = v_approved_by_uid,
    saldo_antes = v_saldo_depois,
    saldo_depois = v_saldo_depois,
    ip_address = COALESCE(p_ip_address, m.ip_address),
    user_agent = COALESCE(p_user_agent, m.user_agent),
    device_id = COALESCE(p_device_id, m.device_id),
    terminal_id = COALESCE(p_terminal_id, m.terminal_id),
    updated_at = now()
  WHERE m.id = v_mov.id;

  PERFORM internal.sincronizar_saldo_cache(v_mov.caixa_id);
  SELECT ROUND(c.saldo_atual, 2) INTO v_saldo_depois FROM public.caixas c WHERE c.id = v_mov.caixa_id;
  UPDATE public.movimentacoes_caixa m SET saldo_depois = v_saldo_depois WHERE m.id = v_mov.id;

  RETURN QUERY
  SELECT v_mov.id, 'aprovado'::text, v_saldo_depois;
END;
$function$;


CREATE OR REPLACE FUNCTION public.registrar_liquidacao_receber(
  p_titulo_id uuid,
  p_valor numeric,
  p_forma_pagamento text,
  p_observacao text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_caixa_id uuid DEFAULT NULL,
  p_origem text DEFAULT 'UI_FINANCEIRO'
)
RETURNS TABLE(
  liquidacao_id uuid,
  titulo_id uuid,
  valor numeric,
  valor_aberto numeric,
  status text,
  caixa_id uuid,
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
  v_loja_titulo uuid;
  v_aberto numeric;
  v_status text;
  v_forma text := upper(btrim(COALESCE(p_forma_pagamento, '')));
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_origem text := btrim(COALESCE(p_origem, ''));
  v_observacao text := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_caixa_id uuid := p_caixa_id;
  v_caixas_elegiveis integer;
  v_liquidacao public.liquidacoes_receber%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'LIQUIDACAO_AUTH'; END IF;

  SELECT u.loja_id
  INTO v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid
    AND u.ativo = true
    AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND THEN RAISE EXCEPTION 'LIQUIDACAO_PERFIL'; END IF;

  IF p_valor IS NULL OR p_valor <= 0
     OR p_valor <> public.round_abnt(p_valor, 2) THEN
    RAISE EXCEPTION 'LIQUIDACAO_VALOR';
  END IF;
  IF v_key = '' THEN RAISE EXCEPTION 'LIQUIDACAO_IDEMPOTENCY_KEY'; END IF;
  IF v_origem = '' THEN RAISE EXCEPTION 'LIQUIDACAO_ORIGEM'; END IF;
  IF v_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'OUTROS') THEN
    RAISE EXCEPTION 'LIQUIDACAO_FORMA_PAGAMENTO';
  END IF;

  SELECT cr.valor_aberto, cr.loja_id, cr.status
  INTO v_aberto, v_loja_titulo, v_status
  FROM public.contas_receber cr
  WHERE cr.id = p_titulo_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LIQUIDACAO_TITULO'; END IF;

  -- P0-4: nenhum perfil liquida título de outra loja. Mesma regra do AP.
  IF v_loja_titulo IS DISTINCT FROM v_loja_usuario THEN
    RAISE EXCEPTION 'LIQUIDACAO_LOJA_DIVERGENTE';
  END IF;

  SELECT lr.* INTO v_liquidacao
  FROM public.liquidacoes_receber lr
  WHERE lr.titulo_id = p_titulo_id AND lr.idempotency_key = v_key;

  IF FOUND THEN
    IF v_liquidacao.valor <> p_valor
       OR v_liquidacao.forma_pagamento <> v_forma
       OR v_liquidacao.origem <> v_origem
       OR v_liquidacao.observacao IS DISTINCT FROM v_observacao
       OR (p_caixa_id IS NOT NULL AND v_liquidacao.caixa_id IS DISTINCT FROM p_caixa_id) THEN
      RAISE EXCEPTION 'LIQUIDACAO_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;

    RETURN QUERY SELECT
      v_liquidacao.id, v_liquidacao.titulo_id, v_liquidacao.valor,
      v_aberto, v_status, v_liquidacao.caixa_id, true;
    RETURN;
  END IF;

  IF p_valor > v_aberto THEN RAISE EXCEPTION 'LIQUIDACAO_EXCEDE_ABERTO'; END IF;

  IF v_forma = 'DINHEIRO' THEN
    IF v_caixa_id IS NULL THEN
      SELECT count(*), min(c.id::text)::uuid
      INTO v_caixas_elegiveis, v_caixa_id
      FROM public.caixas c
      WHERE c.loja_id = v_loja_titulo AND c.status = 'ABERTO';

      IF v_caixas_elegiveis = 0 THEN RAISE EXCEPTION 'LIQUIDACAO_CAIXA_ABERTO_OBRIGATORIO'; END IF;
      IF v_caixas_elegiveis > 1 THEN RAISE EXCEPTION 'LIQUIDACAO_CAIXA_SELECAO_OBRIGATORIA'; END IF;
    END IF;

    PERFORM 1 FROM public.caixas c
    WHERE c.id = v_caixa_id
      AND c.loja_id = v_loja_titulo
      AND c.status = 'ABERTO'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LIQUIDACAO_CAIXA_INVALIDO'; END IF;
  ELSIF v_caixa_id IS NOT NULL THEN
    RAISE EXCEPTION 'LIQUIDACAO_CAIXA_APENAS_DINHEIRO';
  END IF;

  INSERT INTO public.liquidacoes_receber (
    titulo_id, valor, forma_pagamento, observacao, created_by,
    idempotency_key, origem, loja_id, caixa_id, operacao_tipo
  ) VALUES (
    p_titulo_id, p_valor, v_forma, v_observacao, v_uid,
    v_key, v_origem, v_loja_titulo, v_caixa_id, 'RECEBIMENTO'
  ) RETURNING * INTO v_liquidacao;

  v_aberto := public.round_abnt(v_aberto - p_valor, 2);
  v_status := CASE WHEN v_aberto = 0 THEN 'QUITADO' ELSE 'PARCIAL' END;

  UPDATE public.contas_receber cr
  SET valor_aberto = v_aberto, status = v_status
  WHERE cr.id = p_titulo_id;

  IF v_forma = 'DINHEIRO' THEN
    -- Fato já em liquidacoes_receber; E(c) inclui o recebimento — só materializa cache.
    PERFORM internal.sincronizar_saldo_cache(v_caixa_id);
  END IF;

  RETURN QUERY SELECT
    v_liquidacao.id, v_liquidacao.titulo_id, v_liquidacao.valor,
    v_aberto, v_status, v_liquidacao.caixa_id, false;
END;
$function$;


COMMENT ON FUNCTION public.registrar_liquidacao_receber(
  uuid, numeric, text, text, text, uuid, text
) IS 'SSOT-002/AR: liquidação + materialização de E(c) no cache (sem UPDATE incremental de saldo_atual).';

CREATE OR REPLACE FUNCTION public.estornar_liquidacao_receber(
  p_liquidacao_id uuid,
  p_motivo text,
  p_idempotency_key text,
  p_origem text DEFAULT 'UI_FINANCEIRO'
)
RETURNS TABLE(
  estorno_id uuid,
  liquidacao_origem_id uuid,
  titulo_id uuid,
  valor numeric,
  valor_aberto numeric,
  status text,
  caixa_id uuid,
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
  v_orig public.liquidacoes_receber%ROWTYPE;
  v_estorno public.liquidacoes_receber%ROWTYPE;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_origem text := btrim(COALESCE(p_origem, ''));
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_loja_titulo uuid;
  v_aberto numeric;
  v_total numeric;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ESTORNO_AR_AUTH'; END IF;

  SELECT u.loja_id INTO v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo = true
    AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AR_PERFIL'; END IF;

  IF v_key = '' THEN RAISE EXCEPTION 'ESTORNO_AR_IDEMPOTENCY_KEY'; END IF;
  IF v_origem = '' THEN RAISE EXCEPTION 'ESTORNO_AR_ORIGEM'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'ESTORNO_AR_MOTIVO'; END IF;

  SELECT * INTO v_orig FROM public.liquidacoes_receber lr
  WHERE lr.id = p_liquidacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AR_LIQUIDACAO_NAO_ENCONTRADA'; END IF;

  IF COALESCE(v_orig.operacao_tipo, 'RECEBIMENTO') <> 'RECEBIMENTO' THEN
    RAISE EXCEPTION 'ESTORNO_AR_ORIGEM_NAO_E_RECEBIMENTO';
  END IF;

  SELECT cr.loja_id, cr.valor_aberto, cr.valor_total
  INTO v_loja_titulo, v_aberto, v_total
  FROM public.contas_receber cr WHERE cr.id = v_orig.titulo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AR_TITULO'; END IF;

  IF v_loja_titulo IS DISTINCT FROM v_loja_usuario THEN
    RAISE EXCEPTION 'ESTORNO_AR_LOJA_DIVERGENTE';
  END IF;

  -- Replay pela mesma chave devolve o fato já criado.
  SELECT * INTO v_estorno FROM public.liquidacoes_receber lr
  WHERE lr.titulo_id = v_orig.titulo_id AND lr.idempotency_key = v_key;
  IF FOUND THEN
    IF v_estorno.operacao_origem_id IS DISTINCT FROM p_liquidacao_id THEN
      RAISE EXCEPTION 'ESTORNO_AR_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN QUERY SELECT v_estorno.id, v_estorno.operacao_origem_id, v_estorno.titulo_id,
      v_estorno.valor, v_aberto, (SELECT cr.status FROM public.contas_receber cr
        WHERE cr.id = v_orig.titulo_id), v_estorno.caixa_id, true;
    RETURN;
  END IF;

  -- Um recebimento só pode ser estornado uma vez.
  IF EXISTS (SELECT 1 FROM public.liquidacoes_receber lr
             WHERE lr.operacao_origem_id = p_liquidacao_id) THEN
    RAISE EXCEPTION 'ESTORNO_AR_JA_ESTORNADO';
  END IF;

  IF public.round_abnt(v_aberto + v_orig.valor, 2) > v_total THEN
    RAISE EXCEPTION 'ESTORNO_AR_EXCEDE_TITULO';
  END IF;

  -- Efeito físico apenas para dinheiro: sai da gaveta de volta para o cliente.
  IF v_orig.forma_pagamento = 'DINHEIRO' THEN
    IF v_orig.caixa_id IS NULL THEN RAISE EXCEPTION 'ESTORNO_AR_CAIXA_ORIGEM_AUSENTE'; END IF;
    PERFORM 1 FROM public.caixas c
    WHERE c.id = v_orig.caixa_id AND c.loja_id = v_loja_titulo AND c.status = 'ABERTO'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AR_CAIXA_INVALIDO'; END IF;
  END IF;

  INSERT INTO public.liquidacoes_receber (
    titulo_id, valor, forma_pagamento, observacao, created_by,
    idempotency_key, origem, loja_id, caixa_id, operacao_tipo, operacao_origem_id
  ) VALUES (
    v_orig.titulo_id, v_orig.valor, v_orig.forma_pagamento, v_motivo, v_uid,
    v_key, v_origem, v_loja_titulo, v_orig.caixa_id, 'ESTORNO', p_liquidacao_id
  ) RETURNING * INTO v_estorno;

  v_aberto := public.round_abnt(v_aberto + v_orig.valor, 2);
  v_status := CASE WHEN v_aberto >= v_total THEN 'ABERTO' ELSE 'PARCIAL' END;
  UPDATE public.contas_receber cr
  SET valor_aberto = v_aberto, status = v_status
  WHERE cr.id = v_orig.titulo_id;

  IF v_orig.forma_pagamento = 'DINHEIRO' THEN
    -- Guard por E(c) ANTES do fato de estorno já inserido acima: o INSERT já
    -- entrou em liquidacoes; E(c) já descontou. Se E(c) ficou negativo, falha
    -- e a TX desfaz o INSERT.
    IF internal.valor_sistema_dinheiro(v_orig.caixa_id) < 0 THEN
      RAISE EXCEPTION 'ESTORNO_AR_SALDO_INSUFICIENTE'
        USING DETAIL = format('valor_sistema=%s', internal.valor_sistema_dinheiro(v_orig.caixa_id));
    END IF;
    PERFORM internal.sincronizar_saldo_cache(v_orig.caixa_id);
  END IF;

  RETURN QUERY SELECT v_estorno.id, v_estorno.operacao_origem_id, v_estorno.titulo_id,
    v_estorno.valor, v_aberto, v_status, v_estorno.caixa_id, false;
END;
$function$;


COMMENT ON FUNCTION public.estornar_liquidacao_receber(uuid, text, text, text) IS
  'SSOT-002: estorno AR; guard pós-fato por E(c)<0; cache via sincronizar_saldo_cache.';


DO $prova$
DECLARE
  r text; a text; l text; e text;
BEGIN
  SELECT pg_get_functiondef('public.registrar_movimentacao(uuid,text,text,numeric,text,text,text,uuid,text,inet,text,text,text,uuid,uuid)'::regprocedure) INTO r;
  IF strpos(r, 'saldo_atual = ROUND(c.saldo_atual + v_delta') > 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: registrar_movimentacao ainda incrementa saldo_atual';
  END IF;
  IF strpos(r, 'sincronizar_saldo_cache') = 0 OR strpos(r, 'valor_sistema_dinheiro') = 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: registrar_movimentacao sem E(c)/sync';
  END IF;

  SELECT pg_get_functiondef('public.aprovar_movimentacao(uuid,inet,text,text,text,uuid,text)'::regprocedure) INTO a;
  IF strpos(a, 'saldo_atual = ROUND(c.saldo_atual + v_delta') > 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: aprovar_movimentacao ainda incrementa saldo_atual';
  END IF;
  IF strpos(a, 'sincronizar_saldo_cache') = 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: aprovar_movimentacao sem sync';
  END IF;

  SELECT pg_get_functiondef('public.registrar_liquidacao_receber(uuid,numeric,text,text,text,uuid,text)'::regprocedure) INTO l;
  IF strpos(l, 'saldo_atual = public.round_abnt') > 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: liquidacao ainda UPDATE saldo_atual';
  END IF;
  IF strpos(l, 'sincronizar_saldo_cache') = 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: liquidacao sem sync';
  END IF;

  SELECT pg_get_functiondef('public.estornar_liquidacao_receber(uuid,text,text,text)'::regprocedure) INTO e;
  IF strpos(e, 'SET saldo_atual = public.round_abnt') > 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: estorno AR ainda UPDATE saldo_atual';
  END IF;
  IF strpos(e, 'sincronizar_saldo_cache') = 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: estorno AR sem sync';
  END IF;

  RAISE NOTICE 'SSOT-002 PROVA ESTRUTURAL OK (mov/AR)';
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
$golive_stmt_636de0ede043$]);
DO $chk$ DECLARE v text; o bigint; BEGIN
  SELECT replace((SELECT (SELECT 'vendas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,chave_nf,cliente_id,created_at,data,forma_pagamento,id,idempotency_key,numero_nf,operador_id,pricing_version_id,status,tipo_venda,total_bruto,total_desconto,total_liquido)::text) h FROM public.vendas) s)||' # '||(SELECT 'itens_venda:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(custo_unitario_snap,desconto_unitario,id,preco_unitario,preco_unitario_original,pricing_version_id,produto_id,promocao_desconto_percentual,promocao_nome_snapshot,promocao_regra_id,quantidade,regra_aplicada_id,tipo_preco,tipo_preco_fonte,venda_id)::text) h FROM public.itens_venda) s)||' # '||(SELECT 'vendas_pagamentos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(created_at,forma_pagamento,id,valor,venda_id)::text) h FROM public.vendas_pagamentos) s)||' # '||(SELECT 'caixas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(autorizado_por,conta_financeira_id,data_abertura,data_fechamento,fechamento_diferenca,fechamento_observacao,id,loja_id,motivo_retomada,operador_id,saldo_atual,status,turno_anterior_id,valor_fechamento,valor_inicial)::text) h FROM public.caixas) s)||' # '||(SELECT 'movimentacoes_caixa:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,created_at,deleted_at,device_id,forma_pagamento,gerente_id,id,idempotency_key,ip_address,loja_id,motivo,motivo_codigo,movimentacao_origem_id,numero_sequencial,operador_id,saldo_antes,saldo_depois,status,terminal_id,tipo,updated_at,user_agent,valor)::text) h FROM public.movimentacoes_caixa) s)||' # '||(SELECT 'estoque:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(estoque_minimo,id,loja_id,produto_id,quantidade_atual,updated_at,version)::text) h FROM public.estoque) s)||' # '||(SELECT 'produtos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,atualizado_por,categoria_id,cest,cfop_produto,codigo_barras,codigo_interno,comissao_tipo,comissao_valor,created_at,criado_por,csosn,cst_cofins,cst_pis,estoque_minimo,fornecedor_id,icms_origem,id,imagem_url,limite_transferencia_sem_observacao,localizacao_prateleira,loja_id,marca_id,ncm,nome,nome_reduzido_pdv,nome_sem_acento,observacao,origem,permitir_abaixo_custo,preco_atacado,preco_custo,preco_custo_medio,preco_varejo,quantidade_gatilho_atacado,referencia_fornecedor,status_publicacao,tags,tem_nf,unidade_medida,updated_at)::text) h FROM public.produtos) s)||' # '||(SELECT 'usuarios:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,funcionario_id,id,idioma_preferido,loja_id,nome,perfil)::text) h FROM public.usuarios) s)||' # '||(SELECT 'clientes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,consentimento_privacidade_em,created_at,documento,email,endereco,id,limite_credito,loja_id,nome,telefone,termos_aceitos_em,tipo)::text) h FROM public.clientes) s)||' # '||(SELECT 'lojas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,cnae,cnpj,codigo,created_at,email,endereco_bairro,endereco_cep,endereco_cidade,endereco_complemento,endereco_logradouro,endereco_numero,endereco_uf,id,inscricao_estadual,logo_url,nome,nome_fantasia,numero_serie_nfce,numero_serie_nfe,razao_social,telefone)::text) h FROM public.lojas) s)||' # '||(SELECT 'formas_pagamento:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,codigo,created_at,id,loja_id,nome,prazo_compensacao_dias,taxa_percentual,updated_at)::text) h FROM public.formas_pagamento) s)||' # '||(SELECT 'contas_financeiras:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,criado_por,data_inicial,id,loja_id,nome,tipo)::text) h FROM public.contas_financeiras) s)||' # '||(SELECT 'contas_pagar:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(cancelamento_em,cancelamento_motivo,categoria_id,competencia,criado_em,descricao,favorecido,fornecedor_id,id,loja_id,lote_id,nfe_importacao_id,nfe_numero,observacao,parcela,status,valor_pago,valor_total,vencimento)::text) h FROM public.contas_pagar) s)||' # '||(SELECT 'contas_receber:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(categoria_id,cliente_id,competencia,created_at,descricao,id,loja_id,status,valor_aberto,valor_total,vencimento,venda_id)::text) h FROM public.contas_receber) s)||' # '||(SELECT 'pdv_config:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(alertas_leves_ativos,auto_enqueue_fiscal,blind_closure,cfop_padrao,cst_padrao,formato_impressao,gerente_id,gerente_senha_bcrypt,id,idioma_padrao,imprimir_cupom_auto,limite_sangria_sem_gerente,limite_transferencia_obs,loja_id,max_desconto_gerente_percentual,max_desconto_manual_item_percentual,max_desconto_total_percentual,modo_limite_credito,quantidade_minima_atacado_padrao,regime_tributario,show_margin_visual,show_preco_fonte,show_stock_alerts,tema_padrao)::text) h FROM public.pdv_config) s)||' # '||(SELECT 'documentos_fiscais_pendentes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(chave_fiscal,correlation_id,created_at,deleted_at,fiscal_action_hint,fiscal_error_category,fiscal_error_code,fiscal_error_payload,fiscal_next_step_url,fiscal_retryable,id,payload,processado_em,protocolo,provider,provider_ref,proxima_tentativa_em,status,tentativas,tipo_doc,transicao_origem,ultima_tentativa_em,ultima_transicao_em,ultimo_erro,updated_at,venda_id,xml_armazenado_em,xml_lease_expires_em,xml_lease_token,xml_proxima_tentativa_em,xml_sha256,xml_status,xml_storage_path,xml_tentativas,xml_ultimo_erro)::text) h FROM public.documentos_fiscais_pendentes) s)||' # '||(SELECT 'totais:'||coalesce(string_agg(x,';' ORDER BY x),'') FROM (SELECT md5(l.id::text)||'|'||(SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(v.total_liquido),0) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id AND v.status<>'CANCELADA')||'|'||(SELECT coalesce(sum(p.valor),0) FROM public.vendas_pagamentos p JOIN public.vendas v ON v.id=p.venda_id JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(saldo_atual),0) FROM public.caixas c WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(round(sum(quantidade_atual),3),0) FROM public.estoque e WHERE e.loja_id=l.id) x FROM public.lojas l) z)), ' # ', chr(1)) INTO v;
  IF v IS DISTINCT FROM $b$vendas:260:5c1f5a5067490828724c7e6793e90486itens_venda:265:8c5a0c68d26d3683324ab4398a339663vendas_pagamentos:108:0a473fb3507497a004a8939017d6b319caixas:56:a6e57b48a99c3bfdc2ababb690273a69movimentacoes_caixa:11:2b75d41eb7791147043b68015c89c0bdestoque:152:8f192671704ed300a97bf971f5aee4a9produtos:155:ce12eba23be390e38a178815fc4775c7usuarios:11:c3771aebcbf5642fa549d05fcb882a47clientes:2:88eb3c9ee632ac0dbbe5a6eb00b1f5b0lojas:1:c9488d2a43396d63bb7b482208a72fceformas_pagamento:4:7e3fee7650f570993c242c9513012e19contas_financeiras:0:-contas_pagar:9:541b1dc81dc7b94c4658301b64af6585contas_receber:3:a8c78e9630e752753334b8b4bbf76cadpdv_config:2:56a096d60214c463df2cfcc6b5b9ef23documentos_fiscais_pendentes:42:638d9052af1666def9bd7513e9d8b809totais:b5381bb6313900060b277d41cd1d490c|260|19364.60|11048.90|14053.10|32304.095$b$ THEN RAISE EXCEPTION 'GOLIVE_STOP: totais/hashes divergem da baseline após 20261007170000: %', replace(v, chr(1), ' # '); END IF;
  WITH fk AS (SELECT c.conrelid::regclass filho, c.confrelid::regclass pai,
 (SELECT string_agg(format('f.%I = p.%I', af.attname, ap.attname), ' AND ' ORDER BY k.i) FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(fc, pc, i) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc JOIN pg_attribute ap ON ap.attrelid=c.confrelid AND ap.attnum=k.pc) cond,
 (SELECT string_agg(format('f.%I IS NOT NULL', af.attname), ' AND ') FROM unnest(c.conkey) k(fc) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc) nn
 FROM pg_constraint c WHERE c.contype='f' AND c.connamespace IN ('public'::regnamespace) )
SELECT count(*) FILTER (WHERE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', filho, nn, pai, cond), false, true, '')))[1]::text::bigint > 0) FROM fk INTO o;
  IF o <> 0 THEN RAISE EXCEPTION 'GOLIVE_STOP: % FK(s) com órfãos após 20261007170000', o; END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007170000' AND name='ssot_002_mov_ar_ec_cache') THEN RAISE EXCEPTION 'GOLIVE_STOP: linha de histórico ausente 20261007170000'; END IF;
END $chk$;
COMMIT;
