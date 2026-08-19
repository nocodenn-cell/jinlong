-- P1-4: semântica transacional de reversão para AR e AP.
--
-- Problema comprovado: a Fase 1A provisionou `operacao_tipo='ESTORNO'` e
-- `operacao_origem_id` nas duas tabelas de histórico, mas nenhum fluxo os usava.
-- O cancelamento de AP era um UPDATE direto de tabela em `payablePayment.ts:93`
-- (`status='CANCELADO'` + motivo), deixando pagamento registrado e sangria
-- aplicada sem contrapartida — o análogo do FIN-298-04 no lado AP.
--
-- Modelo de compensação (append-only, sem DELETE e sem UPDATE do fato original):
--
--   operação original                      (PAGAMENTO / RECEBIMENTO)
--       ↓  preservada, jamais alterada
--   linha compensatória                    (ESTORNO, valor positivo)
--       ↓
--   operacao_origem_id -> id do fato original
--
-- `valor > 0` é CHECK nas duas tabelas, então o sinal é carregado por
-- `operacao_tipo`, não pelo valor. Isso já era a convenção esperada por
-- `calcular_valor_sistema_dinheiro_caixa`, que soma AR com
-- `CASE WHEN operacao_tipo='ESTORNO' THEN -valor ELSE valor END`.
--
-- Efeito físico:
--   * AR em DINHEIRO devolve o dinheiro ao cliente -> DEBITA o contador;
--   * AP em DINHEIRO recompõe a gaveta -> reusa `estornar_movimentacao` sobre a
--     sangria original. Nenhum writer novo do contador é criado, e
--     `uq_movimentacoes_caixa_estorno_ativo` garante uma única reversão física.
--   * formas não físicas não tocam o contador em nenhum dos dois lados.
--
-- Idempotência: os UNIQUE parciais da Fase 1A — `(titulo_id, idempotency_key)` e
-- `(conta_id, idempotency_key)` — cobrem o estorno pela mesma chave. Um segundo
-- estorno com chave diferente é bloqueado pela checagem de
-- `operacao_origem_id` já existente.
--
-- ROLLBACK: DROP das três funções abaixo. Nenhuma coluna é criada.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- AR — estorno de uma liquidação
-- ═══════════════════════════════════════════════════════════════════════════

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
    UPDATE public.caixas c
    SET saldo_atual = public.round_abnt(COALESCE(c.saldo_atual, 0) - v_orig.valor, 2)
    WHERE c.id = v_orig.caixa_id
      AND public.round_abnt(COALESCE(c.saldo_atual, 0) - v_orig.valor, 2) >= 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AR_SALDO_INSUFICIENTE'; END IF;
  END IF;

  RETURN QUERY SELECT v_estorno.id, v_estorno.operacao_origem_id, v_estorno.titulo_id,
    v_estorno.valor, v_aberto, v_status, v_estorno.caixa_id, false;
END;
$function$;

COMMENT ON FUNCTION public.estornar_liquidacao_receber(uuid, text, text, text) IS
  'Compensacao append-only de um recebimento AR. Preserva o fato original e vincula por operacao_origem_id.';

REVOKE ALL ON FUNCTION public.estornar_liquidacao_receber(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estornar_liquidacao_receber(uuid, text, text, text)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- AP — estorno de um pagamento
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.estornar_pagamento_contas_pagar(
  p_pagamento_id uuid,
  p_motivo text,
  p_idempotency_key text,
  p_origem text DEFAULT 'UI_FINANCEIRO'
)
RETURNS TABLE(
  estorno_id uuid,
  pagamento_origem_id uuid,
  conta_id uuid,
  valor numeric,
  valor_pago numeric,
  status text,
  movimentacao_estorno_id uuid,
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
  v_orig public.contas_pagar_pagamentos%ROWTYPE;
  v_estorno public.contas_pagar_pagamentos%ROWTYPE;
  v_conta public.contas_pagar%ROWTYPE;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_origem text := btrim(COALESCE(p_origem, ''));
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_mov record;
  v_mov_estorno uuid;
  v_novo_pago numeric;
  v_novo_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ESTORNO_AP_AUTH'; END IF;

  SELECT u.loja_id INTO v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo = true
    AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AP_PERFIL'; END IF;

  IF v_key = '' THEN RAISE EXCEPTION 'ESTORNO_AP_IDEMPOTENCY_KEY'; END IF;
  IF v_origem = '' THEN RAISE EXCEPTION 'ESTORNO_AP_ORIGEM'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'ESTORNO_AP_MOTIVO'; END IF;

  SELECT * INTO v_orig FROM public.contas_pagar_pagamentos cpp
  WHERE cpp.id = p_pagamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AP_PAGAMENTO_NAO_ENCONTRADO'; END IF;

  IF COALESCE(v_orig.operacao_tipo, 'PAGAMENTO') <> 'PAGAMENTO' THEN
    RAISE EXCEPTION 'ESTORNO_AP_ORIGEM_NAO_E_PAGAMENTO';
  END IF;

  SELECT * INTO v_conta FROM public.contas_pagar cp
  WHERE cp.id = v_orig.conta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ESTORNO_AP_CONTA'; END IF;

  IF v_conta.loja_id IS DISTINCT FROM v_loja_usuario THEN
    RAISE EXCEPTION 'ESTORNO_AP_LOJA';
  END IF;

  SELECT * INTO v_estorno FROM public.contas_pagar_pagamentos cpp
  WHERE cpp.conta_id = v_orig.conta_id AND cpp.idempotency_key = v_key;
  IF FOUND THEN
    IF v_estorno.operacao_origem_id IS DISTINCT FROM p_pagamento_id THEN
      RAISE EXCEPTION 'ESTORNO_AP_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN QUERY SELECT v_estorno.id, v_estorno.operacao_origem_id, v_estorno.conta_id,
      v_estorno.valor, v_conta.valor_pago, v_conta.status,
      v_estorno.movimentacao_caixa_id, true;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.contas_pagar_pagamentos cpp
             WHERE cpp.operacao_origem_id = p_pagamento_id) THEN
    RAISE EXCEPTION 'ESTORNO_AP_JA_ESTORNADO';
  END IF;

  -- Dinheiro volta para a gaveta pelo mecanismo oficial de estorno de movimento.
  -- `uq_movimentacoes_caixa_estorno_ativo` garante uma única reversão física.
  IF v_orig.movimentacao_caixa_id IS NOT NULL THEN
    SELECT * INTO v_mov FROM public.estornar_movimentacao(
      v_orig.movimentacao_caixa_id,
      'Estorno de pagamento AP ' || v_orig.conta_id::text || ' | ' || v_motivo,
      'ap-estorno:' || v_orig.conta_id::text || ':' || v_key,
      NULL, NULL, NULL, NULL, v_uid
    );
    v_mov_estorno := v_mov.movimentacao_id;
    IF v_mov_estorno IS NULL THEN RAISE EXCEPTION 'ESTORNO_AP_SANGRIA_NAO_ESTORNADA'; END IF;
  END IF;

  INSERT INTO public.contas_pagar_pagamentos(
    conta_id, valor, forma_pagamento, data_pagamento, observacao, usuario_id,
    idempotency_key, origem, loja_id, caixa_id, operacao_tipo, operacao_origem_id,
    movimentacao_caixa_id
  ) VALUES (
    v_orig.conta_id, v_orig.valor, v_orig.forma_pagamento, now(), v_motivo, v_uid,
    v_key, v_origem, v_conta.loja_id, v_orig.caixa_id, 'ESTORNO', p_pagamento_id,
    v_mov_estorno
  ) RETURNING * INTO v_estorno;

  -- `valor_pago` deriva do histórico: pagamentos menos estornos.
  SELECT public.round_abnt(COALESCE(sum(
    CASE WHEN COALESCE(cpp.operacao_tipo, 'PAGAMENTO') = 'ESTORNO'
         THEN -cpp.valor ELSE cpp.valor END), 0), 2)
  INTO v_novo_pago
  FROM public.contas_pagar_pagamentos cpp WHERE cpp.conta_id = v_orig.conta_id;

  v_novo_status := CASE
    WHEN v_conta.status = 'CANCELADO' THEN 'CANCELADO'
    WHEN v_novo_pago <= 0 THEN 'PENDENTE'
    WHEN v_novo_pago >= v_conta.valor_total THEN 'PAGO'
    ELSE 'PARCIAL' END;

  UPDATE public.contas_pagar cp
  SET valor_pago = v_novo_pago, status = v_novo_status
  WHERE cp.id = v_orig.conta_id;

  RETURN QUERY SELECT v_estorno.id, v_estorno.operacao_origem_id, v_estorno.conta_id,
    v_estorno.valor, v_novo_pago, v_novo_status, v_mov_estorno, false;
END;
$function$;

COMMENT ON FUNCTION public.estornar_pagamento_contas_pagar(uuid, text, text, text) IS
  'Compensacao append-only de um pagamento AP. Dinheiro volta pela sangria estornada; valor_pago deriva do historico.';

REVOKE ALL ON FUNCTION public.estornar_pagamento_contas_pagar(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento_contas_pagar(uuid, text, text, text)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- AP — cancelamento com estorno integral
-- ═══════════════════════════════════════════════════════════════════════════
-- Substitui o UPDATE direto de `payablePayment.ts`, que deixava pagamento e
-- sangria órfãos.

CREATE OR REPLACE FUNCTION public.cancelar_conta_pagar(
  p_conta_id uuid,
  p_motivo text,
  p_idempotency_key text,
  p_origem text DEFAULT 'UI_FINANCEIRO'
)
RETURNS TABLE(
  conta_id uuid,
  status text,
  valor_pago numeric,
  estornos_gerados integer,
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
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_pag record;
  v_count integer := 0;
  v_pago numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'CANCELAR_AP_AUTH'; END IF;

  SELECT u.loja_id INTO v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo = true
    AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_AP_PERFIL'; END IF;

  IF v_motivo IS NULL OR length(v_motivo) < 2 THEN RAISE EXCEPTION 'CANCELAR_AP_MOTIVO'; END IF;
  IF v_key = '' THEN RAISE EXCEPTION 'CANCELAR_AP_IDEMPOTENCY_KEY'; END IF;

  SELECT * INTO v_conta FROM public.contas_pagar cp WHERE cp.id = p_conta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_AP_CONTA_NAO_ENCONTRADA'; END IF;

  IF v_conta.loja_id IS DISTINCT FROM v_loja_usuario THEN
    RAISE EXCEPTION 'CANCELAR_AP_LOJA';
  END IF;

  IF v_conta.status = 'CANCELADO' THEN
    RETURN QUERY SELECT v_conta.id, v_conta.status, v_conta.valor_pago, 0, true;
    RETURN;
  END IF;

  -- Estorna cada pagamento ainda sem compensação, na ordem cronológica.
  FOR v_pag IN
    SELECT cpp.id FROM public.contas_pagar_pagamentos cpp
    WHERE cpp.conta_id = p_conta_id
      AND COALESCE(cpp.operacao_tipo, 'PAGAMENTO') = 'PAGAMENTO'
      AND NOT EXISTS (SELECT 1 FROM public.contas_pagar_pagamentos e
                      WHERE e.operacao_origem_id = cpp.id)
    ORDER BY cpp.data_pagamento, cpp.id
  LOOP
    PERFORM * FROM public.estornar_pagamento_contas_pagar(
      v_pag.id, v_motivo, v_key || ':' || v_pag.id::text, p_origem);
    v_count := v_count + 1;
  END LOOP;

  SELECT public.round_abnt(COALESCE(sum(
    CASE WHEN COALESCE(cpp.operacao_tipo, 'PAGAMENTO') = 'ESTORNO'
         THEN -cpp.valor ELSE cpp.valor END), 0), 2)
  INTO v_pago
  FROM public.contas_pagar_pagamentos cpp WHERE cpp.conta_id = p_conta_id;

  UPDATE public.contas_pagar cp
  SET status = 'CANCELADO', valor_pago = v_pago,
      cancelamento_motivo = v_motivo, cancelamento_em = now()
  WHERE cp.id = p_conta_id;

  RETURN QUERY SELECT p_conta_id, 'CANCELADO'::text, v_pago, v_count, false;
END;
$function$;

COMMENT ON FUNCTION public.cancelar_conta_pagar(uuid, text, text, text) IS
  'Cancela AP estornando integralmente os pagamentos realizados. Substitui o UPDATE direto de status.';

REVOKE ALL ON FUNCTION public.cancelar_conta_pagar(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_conta_pagar(uuid, text, text, text)
  TO authenticated, service_role;

COMMIT;
