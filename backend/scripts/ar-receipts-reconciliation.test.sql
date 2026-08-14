\set ON_ERROR_STOP on
BEGIN;

-- Loja determinística: precisa ter produto precificado e GERENTE+OPERADOR
-- ativos. Escolher "o primeiro GERENTE" fazia a suíte cair na loja criada por
-- `test:rls-scope`, que não tem produtos, e o resultado dependia da ordem do seed.
SELECT p.loja_id AS loja FROM public.produtos p
WHERE p.preco_varejo > 0
  AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.loja_id = p.loja_id
              AND u.ativo AND u.perfil = 'GERENTE')
  AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.loja_id = p.loja_id
              AND u.ativo AND u.perfil = 'OPERADOR')
ORDER BY p.loja_id, p.id LIMIT 1
\gset
SELECT id AS gerente_id FROM public.usuarios
WHERE perfil = 'GERENTE' AND ativo = true AND loja_id = :'loja'::uuid LIMIT 1
\gset
SELECT id AS operador_id FROM public.usuarios
WHERE perfil = 'OPERADOR' AND ativo = true AND loja_id = :'loja'::uuid LIMIT 1
\gset
-- Exatamente um caixa aberto na loja durante a suíte. Rollback desfaz.
UPDATE public.caixas SET status = 'FECHADO'
WHERE loja_id = :'loja'::uuid AND status = 'ABERTO';
INSERT INTO public.caixas(operador_id, loja_id, status, valor_inicial)
VALUES (NULL, :'loja', 'ABERTO', 0);
INSERT INTO public.clientes(nome, loja_id) VALUES ('Cliente teste AR 2A', :'loja') RETURNING id AS cliente_id
\gset
SELECT id AS caixa, saldo_atual AS saldo_inicial
FROM public.caixas WHERE loja_id = :'loja'::uuid AND status = 'ABERTO' LIMIT 1
\gset

SELECT gen_random_uuid() AS closed_cash, gen_random_uuid() AS other_store,
       gen_random_uuid() AS other_cash, gen_random_uuid() AS permission_title
\gset
INSERT INTO public.caixas(id, operador_id, loja_id, status, saldo_atual)
VALUES (:'closed_cash', :'operador_id', :'loja', 'FECHADO', 0);
INSERT INTO public.lojas(id, nome, codigo)
VALUES (:'other_store', 'Teste outra loja', 'T2A-' || left(:'other_store', 8));
INSERT INTO public.caixas(id, operador_id, loja_id, status, saldo_atual)
VALUES (:'other_cash', :'operador_id', :'other_store', 'FECHADO', 0);
INSERT INTO public.contas_receber(id, cliente_id, valor_total, valor_aberto, loja_id)
VALUES (:'permission_title', :'cliente_id', 1, 1, :'loja');

CREATE FUNCTION pg_temp.fail_ar_receipt() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN RAISE EXCEPTION 'TEST_INTERMEDIATE_FAILURE'; END $f$;
CREATE TRIGGER test_fail_ar_receipt AFTER INSERT ON public.liquidacoes_receber
FOR EACH ROW WHEN (NEW.idempotency_key = 'rollback-key')
EXECUTE FUNCTION pg_temp.fail_ar_receipt();

SELECT set_config('request.jwt.claim.sub', :'gerente_id', true);
SELECT set_config('test.loja', :'loja', true);
SELECT set_config('test.cliente_id', :'cliente_id', true);
SELECT set_config('test.caixa', :'caixa', true);
SELECT set_config('test.operador_id', :'operador_id', true);
SELECT set_config('test.closed_cash', :'closed_cash', true);
SELECT set_config('test.other_cash', :'other_cash', true);
SELECT set_config('test.permission_title', :'permission_title', true);
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_pix uuid := gen_random_uuid();
  v_din uuid := gen_random_uuid();
  v_multi uuid := gen_random_uuid();
  v_r record;
  v_before numeric;
  v_expected_before numeric;
  v_count bigint;
BEGIN
  -- total PIX: realized history and title balance, no physical effect.
  INSERT INTO public.contas_receber(id, cliente_id, valor_total, valor_aberto, loja_id)
  VALUES (v_pix, current_setting('test.cliente_id')::uuid, 10.00, 10.00, current_setting('test.loja')::uuid);
  SELECT saldo_atual INTO v_before FROM public.caixas WHERE id = current_setting('test.caixa')::uuid;
  SELECT * INTO v_r FROM public.registrar_liquidacao_receber(
    v_pix, 10.00, 'PIX', NULL, 'pix-total', NULL, 'TESTE_DB');
  IF v_r.valor_aberto <> 0 OR v_r.status <> 'QUITADO' OR v_r.caixa_id IS NOT NULL THEN
    RAISE EXCEPTION 'pix_total_result_failed';
  END IF;
  IF (SELECT saldo_atual FROM public.caixas WHERE id = current_setting('test.caixa')::uuid) <> v_before THEN
    RAISE EXCEPTION 'pix_changed_drawer';
  END IF;

  -- partial cash, exact R$ 0.01, auto-select sole eligible cash; then total cash.
  INSERT INTO public.contas_receber(id, cliente_id, valor_total, valor_aberto, loja_id)
  VALUES (v_din, current_setting('test.cliente_id')::uuid, 10.01, 10.01, current_setting('test.loja')::uuid);
  SELECT saldo_atual, public.calcular_valor_sistema_dinheiro_caixa(current_setting('test.caixa')::uuid)
  INTO v_before, v_expected_before FROM public.caixas WHERE id = current_setting('test.caixa')::uuid;
  SELECT * INTO v_r FROM public.registrar_liquidacao_receber(
    v_din, 0.01, 'DINHEIRO', 'centavo', 'din-001', NULL, 'TESTE_DB');
  IF v_r.valor_aberto <> 10.00 OR v_r.status <> 'PARCIAL' OR v_r.caixa_id <> current_setting('test.caixa')::uuid THEN
    RAISE EXCEPTION 'cash_partial_failed';
  END IF;
  IF (SELECT saldo_atual FROM public.caixas WHERE id = current_setting('test.caixa')::uuid) <> v_before + 0.01 THEN
    RAISE EXCEPTION 'cash_counter_cent_failed';
  END IF;
  IF public.calcular_valor_sistema_dinheiro_caixa(current_setting('test.caixa')::uuid) <> v_expected_before + 0.01 THEN
    RAISE EXCEPTION 'expected_cash_cent_failed';
  END IF;
  PERFORM * FROM public.registrar_liquidacao_receber(
    v_din, 10.00, 'DINHEIRO', NULL, 'din-restante', current_setting('test.caixa')::uuid, 'TESTE_DB');
  IF (SELECT valor_aberto FROM public.contas_receber WHERE id = v_din) <> 0 THEN
    RAISE EXCEPTION 'cash_total_balance_failed';
  END IF;

  -- two partial receipts; card/PIX never change the drawer.
  INSERT INTO public.contas_receber(id, cliente_id, valor_total, valor_aberto, loja_id)
  VALUES (v_multi, current_setting('test.cliente_id')::uuid, 20.00, 20.00, current_setting('test.loja')::uuid);
  SELECT saldo_atual INTO v_before FROM public.caixas WHERE id = current_setting('test.caixa')::uuid;
  PERFORM * FROM public.registrar_liquidacao_receber(v_multi, 7.00, 'PIX', NULL, 'multi-pix', NULL, 'TESTE_DB');
  PERFORM * FROM public.registrar_liquidacao_receber(v_multi, 5.00, 'CARTAO_CREDITO', NULL, 'multi-card', NULL, 'TESTE_DB');
  IF (SELECT valor_aberto FROM public.contas_receber WHERE id = v_multi) <> 8.00 THEN
    RAISE EXCEPTION 'two_partials_balance_failed';
  END IF;
  IF (SELECT saldo_atual FROM public.caixas WHERE id = current_setting('test.caixa')::uuid) <> v_before THEN
    RAISE EXCEPTION 'non_cash_changed_drawer';
  END IF;

  -- same key + same payload is replay; no second history or drawer effect.
  SELECT saldo_atual INTO v_before FROM public.caixas WHERE id = current_setting('test.caixa')::uuid;
  SELECT * INTO v_r FROM public.registrar_liquidacao_receber(
    v_multi, 1.00, 'DINHEIRO', 'retry', 'retry-key', current_setting('test.caixa')::uuid, 'TESTE_DB');
  SELECT * INTO v_r FROM public.registrar_liquidacao_receber(
    v_multi, 1.00, 'DINHEIRO', 'retry', 'retry-key', current_setting('test.caixa')::uuid, 'TESTE_DB');
  IF v_r.idempotent_replay IS DISTINCT FROM true THEN RAISE EXCEPTION 'retry_not_replay'; END IF;
  SELECT count(*) INTO v_count FROM public.liquidacoes_receber
  WHERE titulo_id = v_multi AND idempotency_key = 'retry-key';
  IF v_count <> 1 OR (SELECT saldo_atual FROM public.caixas WHERE id = current_setting('test.caixa')::uuid) <> v_before + 1 THEN
    RAISE EXCEPTION 'retry_duplicated_effect';
  END IF;

  BEGIN
    PERFORM * FROM public.registrar_liquidacao_receber(
      v_multi, 1.01, 'DINHEIRO', 'retry', 'retry-key', current_setting('test.caixa')::uuid, 'TESTE_DB');
    RAISE EXCEPTION 'different_payload_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%LIQUIDACAO_IDEMPOTENCY_PAYLOAD_DIVERGENTE%' THEN RAISE; END IF;
  END;

  -- missing/closed/cross-store cash and non-money cash correlation.
  BEGIN
    PERFORM * FROM public.registrar_liquidacao_receber(v_multi, 1, 'DINHEIRO', NULL, 'missing', gen_random_uuid(), 'TESTE_DB');
    RAISE EXCEPTION 'missing_cash_accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%LIQUIDACAO_CAIXA_INVALIDO%' THEN RAISE; END IF; END;

  BEGIN
    PERFORM * FROM public.registrar_liquidacao_receber(v_multi, 1, 'DINHEIRO', NULL, 'closed', current_setting('test.closed_cash')::uuid, 'TESTE_DB');
    RAISE EXCEPTION 'closed_cash_accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%LIQUIDACAO_CAIXA_INVALIDO%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM * FROM public.registrar_liquidacao_receber(v_multi, 1, 'DINHEIRO', NULL, 'cross-store', current_setting('test.other_cash')::uuid, 'TESTE_DB');
    RAISE EXCEPTION 'cross_store_cash_accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%LIQUIDACAO_CAIXA_INVALIDO%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM * FROM public.registrar_liquidacao_receber(v_multi, 1, 'PIX', NULL, 'pix-with-cash', current_setting('test.caixa')::uuid, 'TESTE_DB');
    RAISE EXCEPTION 'pix_cash_accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%LIQUIDACAO_CAIXA_APENAS_DINHEIRO%' THEN RAISE; END IF; END;

  -- intermediate failure after history insert rolls back history, title and drawer.
  SELECT saldo_atual INTO v_before FROM public.caixas WHERE id = current_setting('test.caixa')::uuid;
  BEGIN
    PERFORM * FROM public.registrar_liquidacao_receber(v_multi, 1, 'DINHEIRO', NULL, 'rollback-key', current_setting('test.caixa')::uuid, 'TESTE_DB');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%TEST_INTERMEDIATE_FAILURE%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.liquidacoes_receber WHERE titulo_id = v_multi AND idempotency_key = 'rollback-key')
     OR (SELECT saldo_atual FROM public.caixas WHERE id = current_setting('test.caixa')::uuid) <> v_before THEN
    RAISE EXCEPTION 'intermediate_failure_not_atomic';
  END IF;
END
$test$;

-- More than one eligible drawer requires explicit selection.
RESET ROLE;
SELECT gen_random_uuid() AS second_open_cash, gen_random_uuid() AS multi_cash_title
\gset
INSERT INTO public.caixas(id, operador_id, loja_id, status, saldo_atual)
VALUES (:'second_open_cash', :'gerente_id', :'loja', 'ABERTO', 0);
INSERT INTO public.contas_receber(id, cliente_id, valor_total, valor_aberto, loja_id)
VALUES (:'multi_cash_title', :'cliente_id', 2, 2, :'loja');
SELECT set_config('request.jwt.claim.sub', :'gerente_id', true);
SELECT set_config('test.second_open_cash', :'second_open_cash', true);
SELECT set_config('test.multi_cash_title', :'multi_cash_title', true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM * FROM public.registrar_liquidacao_receber(
      current_setting('test.multi_cash_title')::uuid, 1, 'DINHEIRO', NULL, 'multi-cash-missing', NULL, 'TESTE_DB');
    RAISE EXCEPTION 'multiple_cash_auto_selected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%LIQUIDACAO_CAIXA_SELECAO_OBRIGATORIA%' THEN RAISE; END IF;
  END;

  PERFORM * FROM public.registrar_liquidacao_receber(
    current_setting('test.multi_cash_title')::uuid, 1, 'DINHEIRO', NULL, 'multi-cash-explicit',
    current_setting('test.second_open_cash')::uuid, 'TESTE_DB');
END
$test$;

-- User without the approved profile is rejected by the database RPC.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'operador_id', true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM * FROM public.registrar_liquidacao_receber(current_setting('test.permission_title')::uuid, 1, 'PIX', NULL, 'no-permission', NULL, 'TESTE_DB');
    RAISE EXCEPTION 'operator_was_authorized';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%LIQUIDACAO_PERFIL%' THEN RAISE; END IF; END;
END
$test$;

ROLLBACK;
