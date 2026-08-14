\set ON_ERROR_STOP on
BEGIN;

SELECT id AS gerente_id, loja_id AS loja FROM public.usuarios
WHERE perfil = 'GERENTE' AND ativo = true LIMIT 1 \gset
SELECT id AS operador_id FROM public.usuarios
WHERE perfil = 'OPERADOR' AND ativo = true AND loja_id = :'loja' LIMIT 1 \gset
SELECT id AS caixa FROM public.caixas
WHERE loja_id = :'loja' AND status = 'ABERTO' LIMIT 1 \gset

UPDATE public.caixas SET saldo_atual = 1000 WHERE id = :'caixa';
UPDATE public.pdv_config SET limite_sangria_sem_gerente = 200 WHERE id = 1;

SELECT gen_random_uuid() AS fornecedor, gen_random_uuid() AS other_store,
       gen_random_uuid() AS other_supplier, gen_random_uuid() AS closed_cash,
       gen_random_uuid() AS other_cash, gen_random_uuid() AS permission_account \gset
INSERT INTO public.fornecedores(id, cnpj, nome, loja_id)
VALUES (:'fornecedor', 'T2B-' || left(:'fornecedor', 10), 'Fornecedor teste AP 2B', :'loja');
INSERT INTO public.lojas(id, nome, codigo)
VALUES (:'other_store', 'Outra loja AP 2B', 'AP2B-' || left(:'other_store', 8));
INSERT INTO public.fornecedores(id, cnpj, nome, loja_id)
VALUES (:'other_supplier', 'T2O-' || left(:'other_supplier', 10), 'Fornecedor outra loja', :'other_store');
INSERT INTO public.caixas(id, operador_id, loja_id, status, saldo_atual)
VALUES (:'closed_cash', :'operador_id', :'loja', 'FECHADO', 1000),
       (:'other_cash', :'gerente_id', :'other_store', 'ABERTO', 1000);
INSERT INTO public.contas_pagar(id, fornecedor_id, loja_id, vencimento, valor_total, valor_pago, descricao)
VALUES (:'permission_account', :'fornecedor', :'loja', current_date, 10, 0, 'Sem permissão');

CREATE FUNCTION pg_temp.fail_ap_cash() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.idempotency_key = 'ap:rollback-key' THEN
    RAISE EXCEPTION 'TEST_AP_INTERMEDIATE_FAILURE';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER test_fail_ap_cash AFTER INSERT ON public.movimentacoes_caixa
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_ap_cash();

SELECT set_config('request.jwt.claim.sub', :'gerente_id', true);
SELECT set_config('test.loja', :'loja', true);
SELECT set_config('test.fornecedor', :'fornecedor', true);
SELECT set_config('test.caixa', :'caixa', true);
SELECT set_config('test.closed_cash', :'closed_cash', true);
SELECT set_config('test.other_cash', :'other_cash', true);
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_total_pix uuid := gen_random_uuid();
  v_partial uuid := gen_random_uuid();
  v_cash uuid := gen_random_uuid();
  v_retry uuid := gen_random_uuid();
  v_rollback uuid := gen_random_uuid();
  v_reuse uuid := gen_random_uuid();
  v_r record;
  v_before numeric;
  v_expected_before numeric;
  v_mov uuid;
  v_count bigint;
BEGIN
  INSERT INTO public.contas_pagar(id, fornecedor_id, loja_id, vencimento, valor_total, valor_pago, descricao)
  VALUES
    (v_total_pix, current_setting('test.fornecedor')::uuid, current_setting('test.loja')::uuid, current_date, 10, 0, 'PIX total'),
    (v_partial, current_setting('test.fornecedor')::uuid, current_setting('test.loja')::uuid, current_date, 20, 0, 'Parciais'),
    (v_cash, current_setting('test.fornecedor')::uuid, current_setting('test.loja')::uuid, current_date, 10.01, 0, 'Dinheiro'),
    (v_retry, current_setting('test.fornecedor')::uuid, current_setting('test.loja')::uuid, current_date, 10, 0, 'Retry'),
    (v_rollback, current_setting('test.fornecedor')::uuid, current_setting('test.loja')::uuid, current_date, 10, 0, 'Rollback'),
    (v_reuse, current_setting('test.fornecedor')::uuid, current_setting('test.loja')::uuid, current_date, 10, 0, 'Reuse');

  -- Total and partial non-physical payments never change the drawer.
  SELECT saldo_atual INTO v_before FROM public.caixas WHERE id = current_setting('test.caixa')::uuid;
  SELECT * INTO v_r FROM public.registrar_pagamento_contas_pagar(
    v_total_pix, 10, 'PIX', '2026-08-13T12:00:00Z', NULL, 'pix-total', NULL, 'TESTE_DB', NULL);
  IF v_r.valor_pago <> 10 OR v_r.status <> 'PAGO' OR v_r.movimentacao_caixa_id IS NOT NULL THEN
    RAISE EXCEPTION 'pix_total_failed';
  END IF;
  PERFORM * FROM public.registrar_pagamento_contas_pagar(
    v_partial, 7, 'PIX', '2026-08-13T12:01:00Z', NULL, 'partial-pix', NULL, 'TESTE_DB', NULL);
  PERFORM * FROM public.registrar_pagamento_contas_pagar(
    v_partial, 5, 'CARTAO', '2026-08-13T12:02:00Z', NULL, 'partial-card', NULL, 'TESTE_DB', NULL);
  IF (SELECT valor_pago FROM public.contas_pagar WHERE id = v_partial) <> 12
     OR (SELECT status FROM public.contas_pagar WHERE id = v_partial) <> 'PARCIAL'
     OR (SELECT saldo_atual FROM public.caixas WHERE id = current_setting('test.caixa')::uuid) <> v_before THEN
    RAISE EXCEPTION 'non_cash_partial_or_drawer_failed';
  END IF;

  -- R$ 0.01 partial cash and remaining total use exactly one approved sangria each.
  SELECT saldo_atual, public.calcular_valor_sistema_dinheiro_caixa(current_setting('test.caixa')::uuid)
    INTO v_before, v_expected_before FROM public.caixas WHERE id = current_setting('test.caixa')::uuid;
  SELECT * INTO v_r FROM public.registrar_pagamento_contas_pagar(
    v_cash, 0.01, 'DINHEIRO', '2026-08-13T12:03:00Z', 'centavo', 'cash-cent', NULL, 'TESTE_DB', NULL);
  IF v_r.valor_pago <> 0.01 OR v_r.status <> 'PARCIAL' OR v_r.movimentacao_caixa_id IS NULL THEN
    RAISE EXCEPTION 'cash_cent_failed';
  END IF;
  IF (SELECT saldo_atual FROM public.caixas WHERE id = current_setting('test.caixa')::uuid) <> v_before - 0.01
     OR public.calcular_valor_sistema_dinheiro_caixa(current_setting('test.caixa')::uuid) <> v_expected_before - 0.01 THEN
    RAISE EXCEPTION 'cash_cent_physical_failed';
  END IF;
  PERFORM * FROM public.registrar_pagamento_contas_pagar(
    v_cash, 10, 'DINHEIRO', '2026-08-13T12:04:00Z', NULL, 'cash-rest', current_setting('test.caixa')::uuid, 'TESTE_DB', NULL);
  IF (SELECT valor_pago FROM public.contas_pagar WHERE id = v_cash) <> 10.01
     OR (SELECT status FROM public.contas_pagar WHERE id = v_cash) <> 'PAGO' THEN
    RAISE EXCEPTION 'cash_total_failed';
  END IF;

  -- Replay has one payment, one sangria and one physical withdrawal.
  SELECT saldo_atual INTO v_before FROM public.caixas WHERE id = current_setting('test.caixa')::uuid;
  SELECT * INTO v_r FROM public.registrar_pagamento_contas_pagar(
    v_retry, 1, 'DINHEIRO', '2026-08-13T12:05:00Z', 'retry', 'retry-key', current_setting('test.caixa')::uuid, 'TESTE_DB', NULL);
  v_mov := v_r.movimentacao_caixa_id;
  SELECT * INTO v_r FROM public.registrar_pagamento_contas_pagar(
    v_retry, 1, 'DINHEIRO', '2026-08-13T12:05:00Z', 'retry', 'retry-key', current_setting('test.caixa')::uuid, 'TESTE_DB', NULL);
  IF v_r.idempotent_replay IS DISTINCT FROM true OR v_r.movimentacao_caixa_id <> v_mov THEN
    RAISE EXCEPTION 'retry_not_replayed';
  END IF;
  SELECT count(*) INTO v_count FROM public.contas_pagar_pagamentos
  WHERE conta_id = v_retry AND idempotency_key = 'retry-key';
  IF v_count <> 1 OR (SELECT saldo_atual FROM public.caixas WHERE id = current_setting('test.caixa')::uuid) <> v_before - 1 THEN
    RAISE EXCEPTION 'retry_duplicated';
  END IF;

  BEGIN
    PERFORM * FROM public.registrar_pagamento_contas_pagar(
      v_retry, 1.01, 'DINHEIRO', '2026-08-13T12:05:00Z', 'retry', 'retry-key', current_setting('test.caixa')::uuid, 'TESTE_DB', NULL);
    RAISE EXCEPTION 'different_payload_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PAGAMENTO_IDEMPOTENCY_PAYLOAD_DIVERGENTE%' THEN RAISE; END IF;
  END;

  -- Invalid cash correlation and non-cash caixa are rejected.
  BEGIN PERFORM * FROM public.registrar_pagamento_contas_pagar(v_retry, 1, 'DINHEIRO', now(), NULL, 'missing', gen_random_uuid(), 'TESTE_DB', NULL);
    RAISE EXCEPTION 'missing_accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%PAGAMENTO_CAIXA_INVALIDO%' THEN RAISE; END IF; END;
  BEGIN PERFORM * FROM public.registrar_pagamento_contas_pagar(v_retry, 1, 'DINHEIRO', now(), NULL, 'closed', current_setting('test.closed_cash')::uuid, 'TESTE_DB', NULL);
    RAISE EXCEPTION 'closed_accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%PAGAMENTO_CAIXA_INVALIDO%' THEN RAISE; END IF; END;
  BEGIN PERFORM * FROM public.registrar_pagamento_contas_pagar(v_retry, 1, 'DINHEIRO', now(), NULL, 'other', current_setting('test.other_cash')::uuid, 'TESTE_DB', NULL);
    RAISE EXCEPTION 'other_cash_accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%PAGAMENTO_CAIXA_INVALIDO%' THEN RAISE; END IF; END;
  BEGIN PERFORM * FROM public.registrar_pagamento_contas_pagar(v_retry, 1, 'PIX', now(), NULL, 'pix-box', current_setting('test.caixa')::uuid, 'TESTE_DB', NULL);
    RAISE EXCEPTION 'pix_box_accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%PAGAMENTO_CAIXA_APENAS_DINHEIRO%' THEN RAISE; END IF; END;

  -- Existing movement cannot be reused as AP correlation.
  PERFORM * FROM public.registrar_movimentacao(current_setting('test.caixa')::uuid, 'sangria', 'dinheiro', 1,
    'preexistente', 'OUTRO', NULL, NULL, 'ap:reuse-key', NULL, NULL, NULL, NULL, current_setting('request.jwt.claim.sub')::uuid, NULL);
  BEGIN
    PERFORM * FROM public.registrar_pagamento_contas_pagar(v_reuse, 1, 'DINHEIRO', now(), NULL, 'reuse-key', current_setting('test.caixa')::uuid, 'TESTE_DB', NULL);
    RAISE EXCEPTION 'movement_reused';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%PAGAMENTO_SANGRIA_CORRELACAO_EXISTENTE%' THEN RAISE; END IF; END;

  -- A DB constraint proves one movement cannot be attached to a second payment.
  BEGIN
    UPDATE public.contas_pagar_pagamentos SET movimentacao_caixa_id = v_mov
    WHERE conta_id = v_total_pix;
    RAISE EXCEPTION 'movement_linked_twice';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- Failure after drawer mutation rolls back movement, payment, title and drawer.
  SELECT saldo_atual INTO v_before FROM public.caixas WHERE id = current_setting('test.caixa')::uuid;
  BEGIN
    PERFORM * FROM public.registrar_pagamento_contas_pagar(v_rollback, 1, 'DINHEIRO', now(), NULL, 'rollback-key', current_setting('test.caixa')::uuid, 'TESTE_DB', NULL);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%TEST_AP_INTERMEDIATE_FAILURE%' THEN RAISE; END IF; END;
  IF EXISTS (SELECT 1 FROM public.contas_pagar_pagamentos WHERE conta_id = v_rollback)
     OR EXISTS (SELECT 1 FROM public.movimentacoes_caixa WHERE idempotency_key = 'ap:rollback-key')
     OR (SELECT valor_pago FROM public.contas_pagar WHERE id = v_rollback) <> 0
     OR (SELECT saldo_atual FROM public.caixas WHERE id = current_setting('test.caixa')::uuid) <> v_before THEN
    RAISE EXCEPTION 'rollback_failed';
  END IF;
END
$test$;

-- Two eligible drawers require explicit selection; no original-sale drawer is inferred.
RESET ROLE;
DELETE FROM public.caixas WHERE id = :'other_cash';
SELECT gen_random_uuid() AS second_cash, gen_random_uuid() AS multi_cash_account \gset
INSERT INTO public.caixas(id, operador_id, loja_id, status, saldo_atual)
VALUES (:'second_cash', :'gerente_id', :'loja', 'ABERTO', 1000);
INSERT INTO public.contas_pagar(id, fornecedor_id, loja_id, vencimento, valor_total, valor_pago, descricao)
VALUES (:'multi_cash_account', :'fornecedor', :'loja', current_date, 2, 0, 'Seleção caixa');
SELECT set_config('request.jwt.claim.sub', :'gerente_id', true);
SELECT set_config('test.multi_cash_account', :'multi_cash_account', true);
SELECT set_config('test.second_cash', :'second_cash', true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  BEGIN
    PERFORM * FROM public.registrar_pagamento_contas_pagar(
      current_setting('test.multi_cash_account')::uuid, 1, 'DINHEIRO', now(), NULL,
      'multi-cash-missing', NULL, 'TESTE_DB', NULL);
    RAISE EXCEPTION 'multiple_cash_auto_selected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PAGAMENTO_CAIXA_SELECAO_OBRIGATORIA%' THEN RAISE; END IF;
  END;
  PERFORM * FROM public.registrar_pagamento_contas_pagar(
    current_setting('test.multi_cash_account')::uuid, 1, 'DINHEIRO', now(), NULL,
    'multi-cash-explicit', current_setting('test.second_cash')::uuid, 'TESTE_DB', NULL);
END $test$;

-- Cross-store title is rejected even for the approved AP profile.
RESET ROLE;
SELECT gen_random_uuid() AS cross_account \gset
INSERT INTO public.contas_pagar(id, fornecedor_id, loja_id, vencimento, valor_total, valor_pago, descricao)
VALUES (:'cross_account', :'other_supplier', :'other_store', current_date, 10, 0, 'Cross store');
SELECT set_config('request.jwt.claim.sub', :'gerente_id', true);
SELECT set_config('test.cross_account', :'cross_account', true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  BEGIN
    PERFORM * FROM public.registrar_pagamento_contas_pagar(current_setting('test.cross_account')::uuid, 1, 'PIX', now(), NULL, 'cross-title', NULL, 'TESTE_DB', NULL);
    RAISE EXCEPTION 'cross_title_accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%PAGAMENTO_LOJA%' THEN RAISE; END IF; END;
END $test$;

-- High-value sangria consumes the existing manager token inside the AP transaction.
RESET ROLE;
UPDATE public.pdv_config SET limite_sangria_sem_gerente = 1 WHERE id = 1;
SELECT gen_random_uuid() AS auth_account \gset
INSERT INTO public.contas_pagar(id, fornecedor_id, loja_id, vencimento, valor_total, valor_pago, descricao)
VALUES (:'auth_account', :'fornecedor', :'loja', current_date, 2, 0, 'Autorizada');
INSERT INTO public.tokens_desconto_gerente(token, expira_em, usado, loja_id, criado_por)
VALUES ('token-ap-2b', now() + interval '10 minutes', false, :'loja', :'gerente_id');
SELECT set_config('request.jwt.claim.sub', :'gerente_id', true);
SELECT set_config('test.auth_account', :'auth_account', true);
SELECT set_config('test.gerente_id', :'gerente_id', true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_r record; BEGIN
  SELECT * INTO v_r FROM public.registrar_pagamento_contas_pagar(
    current_setting('test.auth_account')::uuid, 2, 'DINHEIRO', '2026-08-13T13:00:00Z', NULL, 'authorized-cash', current_setting('test.caixa')::uuid, 'TESTE_DB', 'token-ap-2b');
  IF NOT (SELECT usado FROM public.tokens_desconto_gerente WHERE token = 'token-ap-2b')
     OR (SELECT status FROM public.movimentacoes_caixa WHERE id = v_r.movimentacao_caixa_id) <> 'aprovado'
     OR (SELECT gerente_id FROM public.movimentacoes_caixa WHERE id = v_r.movimentacao_caixa_id) <> current_setting('test.gerente_id')::uuid THEN
    RAISE EXCEPTION 'authorization_not_proven';
  END IF;
END $test$;

-- Operator lacks AP permission even if they operate the drawer.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'operador_id', true);
SELECT set_config('test.permission_account', :'permission_account', true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  BEGIN
    PERFORM * FROM public.registrar_pagamento_contas_pagar(current_setting('test.permission_account')::uuid, 1, 'PIX', now(), NULL, 'no-permission', NULL, 'TESTE_DB', NULL);
    RAISE EXCEPTION 'operator_authorized';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%PAGAMENTO_PERFIL%' THEN RAISE; END IF; END;
END $test$;

ROLLBACK;
