-- Regressão das migrations 20261016120100_hardening_rls_search_path_residual.sql (#577: RLS + search_path)
-- e 20261023120000_revoga_decrementar_estoque_seguro_authenticated.sql (revoke da baixa de estoque direta).
--
-- Uma transação com ROLLBACK no final — não persiste nada. Prova:
--   1. NEGATIVO: authenticated/anon não executam `decrementar_estoque_seguro` (catálogo + chamada real
--      sob `SET LOCAL ROLE authenticated` → 42501); service_role continua executando.
--   2. search_path fixo nas 8 funções, e cada uma continua com o comportamento de antes (valores
--      calculados, stubs legados ainda abortam, gatilhos de imutabilidade ainda bloqueiam).
--   3. RLS habilitado nas duas tabelas internas, sem grant para anon/authenticated.

\set ON_ERROR_STOP on
BEGIN;

DO $onda1$
DECLARE
  v_fail text[] := ARRAY[]::text[];
  v_sig text;
  v_cfg text[];
  v_tbl text;
  v_num numeric;
  v_txt text;
  v_ok boolean;
BEGIN
  -- ═══ 1. decrementar_estoque_seguro ═══════════════════════════════════════
  IF has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE') THEN
    v_fail := array_append(v_fail, 'decrementar_estoque_seguro: authenticated EXECUTE deveria ser false');
  END IF;
  IF has_function_privilege('anon', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE') THEN
    v_fail := array_append(v_fail, 'decrementar_estoque_seguro: anon EXECUTE deveria ser false');
  END IF;
  IF NOT has_function_privilege('service_role', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE') THEN
    v_fail := array_append(v_fail, 'decrementar_estoque_seguro: service_role EXECUTE deveria ser true');
  END IF;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.decrementar_estoque_seguro(gen_random_uuid(), 1, gen_random_uuid());
    RESET ROLE;
    v_fail := array_append(v_fail, 'decrementar_estoque_seguro: chamada como authenticated deveria falhar com 42501');
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  -- ═══ 2. search_path fixo + comportamento preservado ═════════════════════
  FOREACH v_sig IN ARRAY ARRAY[
    'internal.comissao_valor_item(numeric, numeric, text, numeric, numeric)',
    'internal.desconto_comercial_operador_ok(text, numeric, public.motivo_desconto_enum_tipo)',
    'public.venda_evento_idempotency_key(text, uuid, boolean)',
    'public.trg_comissoes_ajustes_bloquear_mutacao()',
    'public.trg_movimentos_estoque_log_bloquear_mutacao()',
    'public.finalizar_venda_transacional(uuid, uuid, text, numeric, numeric, numeric, jsonb)',
    'public.finalizar_venda_transacional_canonica_v2()',
    'public.finalizar_venda_transacional_canonica_v3()'
  ]
  LOOP
    -- Ausente = só existe em produção (drift, ex.: stub de 7 args) — nada a fixar aqui.
    IF to_regprocedure(v_sig) IS NULL THEN CONTINUE; END IF;
    SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = to_regprocedure(v_sig);
    IF v_cfg IS NULL OR NOT (v_cfg && ARRAY['search_path=""', 'search_path=']) THEN
      v_fail := array_append(v_fail, v_sig || ': search_path deveria ser vazio, está ' || coalesce(array_to_string(v_cfg, ','), 'NULL'));
    END IF;
  END LOOP;

  v_num := internal.comissao_valor_item(3, 10.00, 'percentual', 5, NULL);
  IF v_num IS DISTINCT FROM 1.50 THEN
    v_fail := array_append(v_fail, 'comissao_valor_item percentual: esperado 1.50, veio ' || coalesce(v_num::text, 'NULL'));
  END IF;
  v_num := internal.comissao_valor_item(3, 10.00, 'fixo', NULL, 2.00);
  IF v_num IS DISTINCT FROM 6.00 THEN
    v_fail := array_append(v_fail, 'comissao_valor_item fixo: esperado 6.00, veio ' || coalesce(v_num::text, 'NULL'));
  END IF;

  v_ok := internal.desconto_comercial_operador_ok(NULL, 10, 'AUTORIZACAO_COMERCIAL'::public.motivo_desconto_enum_tipo);
  IF v_ok IS DISTINCT FROM true THEN
    v_fail := array_append(v_fail, 'desconto_comercial_operador_ok(NULL,10,AUTORIZACAO_COMERCIAL) deveria ser true');
  END IF;
  v_ok := internal.desconto_comercial_operador_ok(NULL, 10.01, 'AUTORIZACAO_COMERCIAL'::public.motivo_desconto_enum_tipo);
  IF v_ok IS DISTINCT FROM false THEN
    v_fail := array_append(v_fail, 'desconto_comercial_operador_ok(NULL,10.01,...) deveria ser false');
  END IF;

  v_txt := public.venda_evento_idempotency_key(' pdv ', '00000000-0000-0000-0000-000000000001'::uuid, true);
  IF v_txt IS DISTINCT FROM 'pdv:cancel:00000000-0000-0000-0000-000000000001' THEN
    v_fail := array_append(v_fail, 'venda_evento_idempotency_key: veio ' || coalesce(v_txt, 'NULL'));
  END IF;

  BEGIN
    PERFORM public.finalizar_venda_transacional_canonica_v2();
    v_fail := array_append(v_fail, 'finalizar_venda_transacional_canonica_v2(): deveria abortar');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'LEGACY_DISABLED_USE_V4' THEN
      v_fail := array_append(v_fail, 'finalizar_venda_transacional_canonica_v2(): mensagem inesperada ' || SQLERRM);
    END IF;
  END;

  -- Gatilhos de imutabilidade: mesma função ligada a uma tabela temporária.
  CREATE TEMP TABLE onda1_trg_probe (x int) ON COMMIT DROP;
  INSERT INTO onda1_trg_probe VALUES (1);
  CREATE TRIGGER onda1_mov BEFORE UPDATE ON onda1_trg_probe
    FOR EACH ROW EXECUTE FUNCTION public.trg_movimentos_estoque_log_bloquear_mutacao();
  BEGIN
    UPDATE onda1_trg_probe SET x = 2;
    v_fail := array_append(v_fail, 'trg_movimentos_estoque_log_bloquear_mutacao: UPDATE deveria abortar');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'MOVIMENTOS_ESTOQUE_LOG_IMUTAVEL' THEN
      v_fail := array_append(v_fail, 'trg_movimentos_estoque_log_bloquear_mutacao: mensagem inesperada ' || SQLERRM);
    END IF;
  END;
  DROP TRIGGER onda1_mov ON onda1_trg_probe;
  CREATE TRIGGER onda1_com BEFORE UPDATE ON onda1_trg_probe
    FOR EACH ROW EXECUTE FUNCTION public.trg_comissoes_ajustes_bloquear_mutacao();
  BEGIN
    UPDATE onda1_trg_probe SET x = 3;
    v_fail := array_append(v_fail, 'trg_comissoes_ajustes_bloquear_mutacao: UPDATE deveria abortar');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'COMISSOES_AJUSTES_IMUTAVEL' THEN
      v_fail := array_append(v_fail, 'trg_comissoes_ajustes_bloquear_mutacao: mensagem inesperada ' || SQLERRM);
    END IF;
  END;

  -- ═══ 3. RLS nas tabelas internas ═════════════════════════════════════════
  FOREACH v_tbl IN ARRAY ARRAY['public.sync_request_nonces', 'public.venda_engine_shadow_runs']
  LOOP
    -- `venda_engine_shadow_runs` só existe em produção (criada fora das migrations).
    IF to_regclass(v_tbl) IS NULL THEN CONTINUE; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(v_tbl)) THEN
      v_fail := array_append(v_fail, v_tbl || ': RLS deveria estar habilitado');
    END IF;
    IF has_table_privilege('anon', v_tbl, 'SELECT,INSERT,UPDATE,DELETE') THEN
      v_fail := array_append(v_fail, v_tbl || ': anon não deveria ter DML');
    END IF;
    IF has_table_privilege('authenticated', v_tbl, 'SELECT,INSERT,UPDATE,DELETE') THEN
      v_fail := array_append(v_fail, v_tbl || ': authenticated não deveria ter DML');
    END IF;
  END LOOP;

  IF cardinality(v_fail) > 0 THEN
    RAISE EXCEPTION 'advisor-seguranca-onda1: % falha(s):%', cardinality(v_fail), E'\n  - ' || array_to_string(v_fail, E'\n  - ');
  END IF;
  RAISE NOTICE 'advisor-seguranca-onda1: OK';
END
$onda1$;

ROLLBACK;
