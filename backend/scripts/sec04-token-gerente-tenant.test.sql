-- SEC-04 — regressão de 20260916120000_sec04_token_gerente_vinculo_loja_v4.sql
-- e 20260916120100_sec04_v2_v3_legacy_disabled_convergencia.sql.
--
-- Prova que token de gerente (tokens_desconto_gerente) emitido para outra loja
-- não é aceito pela venda canônica v4 — nem como token de desconto nem como
-- token de limite de crédito — e que o caminho legítimo continua passando:
--   - token emitido por usuário da própria loja       -> passa a guarda
--   - token emitido por DONO de outra loja (Padrão A)  -> passa a guarda
--   - token já usado (retry idempotente)               -> helper não bloqueia
--   - token de outra loja / loja_id forjado / sem emissor -> nega
-- E que v2/v3 não têm mais corpo vivo nem EXECUTE para authenticated/anon.
--
-- `auth.uid()` lê `request.jwt.claim.sub` — set_config simula a sessão.
-- Tudo dentro de transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja_a   uuid := 'f3000001-0000-4000-8000-00000000000a';
  v_loja_b   uuid := 'f3000001-0000-4000-8000-00000000000b';
  v_op_a     uuid := 'f3000002-0000-4000-8000-00000000000a';
  v_op_b     uuid := 'f3000002-0000-4000-8000-00000000000b';
  v_dono_b   uuid := 'f3000002-0000-4000-8000-0000000000d0';
  v_caixa_a  uuid := 'f3000003-0000-4000-8000-00000000000a';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_op_a), (v_op_b), (v_dono_b)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES
    (v_loja_a, 'SEC04 Loja A', 'SEC04-A', true),
    (v_loja_b, 'SEC04 Loja B', 'SEC04-B', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (v_op_a, 'SEC04 Operador A', 'OPERADOR', true, v_loja_a),
    (v_op_b, 'SEC04 Operador B', 'OPERADOR', true, v_loja_b),
    (v_dono_b, 'SEC04 Dono', 'DONO', true, v_loja_b)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  DELETE FROM public.caixas WHERE id = v_caixa_a;
  INSERT INTO public.caixas (id, loja_id, operador_id, status, valor_inicial, data_abertura)
  VALUES (v_caixa_a, v_loja_a, v_op_a, 'ABERTO', 0, now());

  DELETE FROM public.tokens_desconto_gerente WHERE token LIKE 'sec04-test-%';
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por) VALUES
    ('sec04-test-loja-a',        now() + interval '5 min', false, NULL,              v_op_a),
    ('sec04-test-loja-b',        now() + interval '5 min', false, NULL,              v_op_b),
    ('sec04-test-b-forja-loja-a', now() + interval '5 min', false, v_loja_a::text,   v_op_b),
    ('sec04-test-a-loja-b',      now() + interval '5 min', false, v_loja_b::text,    v_op_a),
    ('sec04-test-dono-b',        now() + interval '5 min', false, NULL,              v_dono_b),
    ('sec04-test-sem-emissor',   now() + interval '5 min', false, NULL,              NULL),
    ('sec04-test-a-usado',       now() - interval '1 min', true,  NULL,              v_op_a);
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Helper: matriz de vínculo token x loja
-- ═══════════════════════════════════════════════════════════════════════════

DO $helper$
DECLARE
  v_loja_a uuid := 'f3000001-0000-4000-8000-00000000000a';
BEGIN
  IF internal.token_gerente_fora_da_loja('sec04-test-loja-a', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: token da própria loja marcado como fora';
  END IF;
  IF NOT internal.token_gerente_fora_da_loja('sec04-test-loja-b', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: token de outra loja aceito';
  END IF;
  IF NOT internal.token_gerente_fora_da_loja('sec04-test-b-forja-loja-a', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: loja_id forjado no corpo da Edge venceu o emissor';
  END IF;
  IF NOT internal.token_gerente_fora_da_loja('sec04-test-a-loja-b', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: loja_id gravado divergente aceito';
  END IF;
  IF internal.token_gerente_fora_da_loja('sec04-test-dono-b', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: token emitido por DONO (Padrão A) recusado';
  END IF;
  IF NOT internal.token_gerente_fora_da_loja('sec04-test-sem-emissor', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: token sem emissor aceito';
  END IF;
  IF internal.token_gerente_fora_da_loja('sec04-test-a-usado', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: token usado da própria loja bloqueado (quebraria replay idempotente)';
  END IF;
  IF internal.token_gerente_fora_da_loja('sec04-test-inexistente', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: token inexistente deve ficar com a v4_unscoped';
  END IF;
  RAISE NOTICE 'Helper OK: matriz token x loja.';
END
$helper$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Fronteira de empresa (20261022120000): token de DONO só vale nas empresas dele
-- ═══════════════════════════════════════════════════════════════════════════

DO $empresa$
DECLARE
  v_loja_a  uuid := 'f3000001-0000-4000-8000-00000000000a';
  v_emp2    uuid := 'f3000004-0000-4000-8000-0000000000e2';
  v_loja_c  uuid := 'f3000001-0000-4000-8000-00000000000c';
  v_dono_c  uuid := 'f3000002-0000-4000-8000-0000000000dc';
BEGIN
  -- Empresa nova semeia pdv_config sem a coluna legada gerente_senha_sha256 (NOT NULL até #625 /
  -- 20261022020000). Só dentro desta transação (ROLLBACK no fim), para o teste não depender da ordem dos merges.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'pdv_config'
               AND column_name = 'gerente_senha_sha256' AND is_nullable = 'NO') THEN
    ALTER TABLE public.pdv_config ALTER COLUMN gerente_senha_sha256 DROP NOT NULL;
  END IF;
  INSERT INTO public.empresas (id, nome) VALUES (v_emp2, 'SEC04 Empresa 2') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.lojas (id, nome, codigo, ativo, empresa_id)
  VALUES (v_loja_c, 'SEC04 Loja C (empresa 2)', 'SEC04-C', true, v_emp2)
  ON CONFLICT (id) DO UPDATE SET ativo = true, empresa_id = EXCLUDED.empresa_id;
  INSERT INTO auth.users (id) VALUES (v_dono_c) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_dono_c, 'SEC04 Dono empresa 2', 'DONO', true, v_loja_c)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por) VALUES
    ('sec04-test-dono-emp2-sem-loja',   now() + interval '5 min', false, NULL,           v_dono_c),
    ('sec04-test-dono-emp2-forja-loja', now() + interval '5 min', false, v_loja_a::text, v_dono_c);

  IF public.fp_empresa_da_loja(v_loja_a) IS NOT DISTINCT FROM v_emp2 THEN
    RAISE EXCEPTION 'SEC04_SETUP: loja A não deveria pertencer à empresa 2';
  END IF;
  IF NOT internal.token_gerente_fora_da_loja('sec04-test-dono-emp2-sem-loja', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: token sem loja de DONO de outra empresa aceito (vazamento entre tenants)';
  END IF;
  IF NOT internal.token_gerente_fora_da_loja('sec04-test-dono-emp2-forja-loja', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: token de DONO de outra empresa com loja_id forjado aceito';
  END IF;
  IF internal.token_gerente_fora_da_loja('sec04-test-dono-emp2-sem-loja', v_loja_c) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: token de DONO recusado na própria empresa';
  END IF;

  -- Vínculo ativo do DONO com a empresa da loja A libera (DONO de várias empresas).
  INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo)
  VALUES (v_dono_c, public.fp_empresa_da_loja(v_loja_a), NULL, 'DONO', true);
  IF internal.token_gerente_fora_da_loja('sec04-test-dono-emp2-sem-loja', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: DONO com vínculo ativo na empresa da loja recusado';
  END IF;
  UPDATE public.usuario_vinculos SET ativo = false WHERE usuario_id = v_dono_c;
  IF NOT internal.token_gerente_fora_da_loja('sec04-test-dono-emp2-sem-loja', v_loja_a) THEN
    RAISE EXCEPTION 'SEC04_FALHOU: vínculo inativo ainda libera token entre empresas';
  END IF;
  RAISE NOTICE 'Fronteira de empresa OK: DONO de outra empresa negado; própria empresa e vínculo ativo liberam.';
END
$empresa$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Wrapper v4: token de desconto de outra loja -> TOKEN_GERENTE_INVALIDO
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_desconto_cross_loja$
DECLARE
  v_cross constant text := 'sec04-test-loja-b';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'f3000002-0000-4000-8000-00000000000a', true);
  BEGIN
    PERFORM public.finalizar_venda_transacional_canonica_v4(
      p_venda_id => gen_random_uuid(),
      p_caixa_id => 'f3000003-0000-4000-8000-00000000000a'::uuid,
      p_operador_id => 'f3000002-0000-4000-8000-00000000000a'::uuid,
      p_loja_id => 'f3000001-0000-4000-8000-00000000000a'::uuid,
      p_itens => '[]'::jsonb,
      p_desconto_gerente_token => v_cross,
      p_desconto_gerente_percentual => 5
    );
    RAISE EXCEPTION 'SEC04_FALHOU: v4 aceitou token de desconto da loja B numa venda da loja A';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_INVALIDO%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo OK: token de desconto cross-loja negado (%).', SQLERRM;
  END;
END
$neg_desconto_cross_loja$;

DO $neg_desconto_forjado$
DECLARE
  v_forjado constant text := 'sec04-test-b-forja-loja-a';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'f3000002-0000-4000-8000-00000000000a', true);
  BEGIN
    PERFORM public.finalizar_venda_transacional_canonica_v4(
      p_venda_id => gen_random_uuid(),
      p_caixa_id => 'f3000003-0000-4000-8000-00000000000a'::uuid,
      p_operador_id => 'f3000002-0000-4000-8000-00000000000a'::uuid,
      p_loja_id => 'f3000001-0000-4000-8000-00000000000a'::uuid,
      p_itens => '[]'::jsonb,
      p_desconto_gerente_token => v_forjado,
      p_desconto_gerente_percentual => 5
    );
    RAISE EXCEPTION 'SEC04_FALHOU: v4 aceitou token com loja_id forjado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_INVALIDO%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo OK: loja_id forjado negado (%).', SQLERRM;
  END;
END
$neg_desconto_forjado$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Wrapper v4: token de limite de crédito de outra loja -> LIMITE_CREDITO_TOKEN_INVALIDO
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_limite_credito_cross_loja$
DECLARE
  v_cross constant text := 'sec04-test-loja-b';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'f3000002-0000-4000-8000-00000000000a', true);
  BEGIN
    PERFORM public.finalizar_venda_transacional_canonica_v4(
      p_venda_id => gen_random_uuid(),
      p_caixa_id => 'f3000003-0000-4000-8000-00000000000a'::uuid,
      p_operador_id => 'f3000002-0000-4000-8000-00000000000a'::uuid,
      p_loja_id => 'f3000001-0000-4000-8000-00000000000a'::uuid,
      p_itens => '[]'::jsonb,
      p_limite_credito_gerente_token => v_cross
    );
    RAISE EXCEPTION 'SEC04_FALHOU: v4 aceitou token de limite de crédito da loja B';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_INVALIDO%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo OK: token de limite de crédito cross-loja negado (%).', SQLERRM;
  END;
END
$neg_limite_credito_cross_loja$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Caller não escolhe a loja: operador A informando p_loja_id = B -> LOJA_INVALIDA
-- (a comparação do token usa a loja já provada pela guarda de escopo)
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_loja_parametro_manipulado$
DECLARE
  v_cross constant text := 'sec04-test-loja-b';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'f3000002-0000-4000-8000-00000000000a', true);
  BEGIN
    PERFORM public.finalizar_venda_transacional_canonica_v4(
      p_venda_id => gen_random_uuid(),
      p_caixa_id => 'f3000003-0000-4000-8000-00000000000a'::uuid,
      p_operador_id => 'f3000002-0000-4000-8000-00000000000a'::uuid,
      p_loja_id => 'f3000001-0000-4000-8000-00000000000b'::uuid,
      p_itens => '[]'::jsonb,
      p_desconto_gerente_token => v_cross,
      p_desconto_gerente_percentual => 5
    );
    RAISE EXCEPTION 'SEC04_FALHOU: v4 aceitou p_loja_id divergente da sessão';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FINALIZAR_VENDA_CANONICA_LOJA_INVALIDA%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo OK: p_loja_id manipulado negado (%).', SQLERRM;
  END;
END
$neg_loja_parametro_manipulado$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivos: token legítimo passa a guarda SEC-04 (a chamada segue e falha
-- depois, por itens vazios — o que importa é não ser erro de token).
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_tokens_legitimos$
DECLARE
  v_token text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'f3000002-0000-4000-8000-00000000000a', true);
  FOREACH v_token IN ARRAY ARRAY['sec04-test-loja-a', 'sec04-test-dono-b']
  LOOP
    BEGIN
      PERFORM public.finalizar_venda_transacional_canonica_v4(
        p_venda_id => gen_random_uuid(),
        p_caixa_id => 'f3000003-0000-4000-8000-00000000000a'::uuid,
        p_operador_id => 'f3000002-0000-4000-8000-00000000000a'::uuid,
        p_loja_id => 'f3000001-0000-4000-8000-00000000000a'::uuid,
        p_itens => '[]'::jsonb,
        p_desconto_gerente_token => v_token,
        p_desconto_gerente_percentual => 5,
        p_limite_credito_gerente_token => v_token
      );
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%TOKEN%' THEN
        RAISE EXCEPTION 'SEC04_FALHOU: token legítimo % recusado pela guarda (%)', v_token, SQLERRM;
      END IF;
      RAISE NOTICE 'Positivo OK: % passou a guarda SEC-04 (erro posterior esperado: %).', v_token, SQLERRM;
    END;
  END LOOP;
END
$pos_tokens_legitimos$;

-- ═══════════════════════════════════════════════════════════════════════════
-- v2/v3: sem corpo vivo e sem EXECUTE para authenticated/anon
-- ═══════════════════════════════════════════════════════════════════════════

DO $v2_v3_mortas$
DECLARE
  v_vivas text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_vivas
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('finalizar_venda_transacional_canonica_v2',
                       'finalizar_venda_transacional_canonica_v3')
     AND (position('LEGACY_DISABLED_USE_V4' IN p.prosrc) = 0
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
          OR has_function_privilege('anon', p.oid, 'EXECUTE'));
  IF v_vivas IS NOT NULL THEN
    RAISE EXCEPTION 'SEC04_FALHOU: v2/v3 ainda vivas: %', v_vivas;
  END IF;
  RAISE NOTICE 'v2/v3 OK: todas LEGACY_DISABLED_USE_V4 e fechadas para authenticated/anon.';
END
$v2_v3_mortas$;

SELECT 'SEC04 TOKEN GERENTE TENANT: OK' AS resultado;
ROLLBACK;
