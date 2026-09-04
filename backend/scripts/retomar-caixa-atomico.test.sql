-- Item 22 do Plano Mestre de Fechamento dos Gaps.
--
-- Prova retomar_caixa_atomico (Opção B aprovada — DB-07/DB-08): cria um
-- NOVO turno vinculado, nunca muta o turno FECHADO original. Cobre também
-- os 5 achados P1 do review Codex (comment_ids 3933838075/81/84/90/93):
-- requisitante OPERADOR rejeitado, aprovador inativo rejeitado, retomada
-- duplicada rejeitada, INSERT direto nas colunas de auditoria rejeitado,
-- e UPDATE direto de status FECHADO→ABERTO rejeitado (mesmo via
-- service_role, provando que é invariante de trigger, não só RLS/grant).
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK — não persiste
-- nada em produção.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja_a          uuid := 'f2000001-0000-4000-8000-000000000001';
  v_loja_b          uuid := 'f2000001-0000-4000-8000-000000000002';
  v_gerente_a       uuid := 'f2000002-0000-4000-8000-000000000001';
  v_gerente_b       uuid := 'f2000002-0000-4000-8000-000000000002';
  v_dono            uuid := 'f2000002-0000-4000-8000-000000000003';
  v_operador        uuid := 'f2000002-0000-4000-8000-000000000004';
  v_operador2       uuid := 'f2000002-0000-4000-8000-000000000005';
  v_gerente_inativo uuid := 'f2000002-0000-4000-8000-000000000006';
  v_gerente_c       uuid := 'f2000002-0000-4000-8000-000000000007';
  v_caixa_fechado   uuid := 'f2000003-0000-4000-8000-000000000001';
  v_caixa_aberto    uuid := 'f2000003-0000-4000-8000-000000000002';
  v_caixa_fechado2  uuid := 'f2000003-0000-4000-8000-000000000003';
  v_caixa_gerentec  uuid := 'f2000003-0000-4000-8000-000000000004';
BEGIN
  INSERT INTO auth.users (id) VALUES
    (v_gerente_a), (v_gerente_b), (v_dono), (v_operador), (v_operador2),
    (v_gerente_inativo), (v_gerente_c)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES
    (v_loja_a, 'RETC Loja A', 'RETC-A', true),
    (v_loja_b, 'RETC Loja B', 'RETC-B', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (v_gerente_a, 'RETC Gerente A', 'GERENTE', true, v_loja_a),
    (v_gerente_b, 'RETC Gerente B', 'GERENTE', true, v_loja_b),
    (v_dono, 'RETC Dono', 'DONO', true, v_loja_a),
    (v_operador, 'RETC Operador', 'OPERADOR', true, v_loja_a),
    (v_operador2, 'RETC Operador 2', 'OPERADOR', true, v_loja_a),
    (v_gerente_inativo, 'RETC Gerente Inativo', 'GERENTE', false, v_loja_a),
    (v_gerente_c, 'RETC Gerente C', 'GERENTE', true, v_loja_a)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = EXCLUDED.ativo, loja_id = EXCLUDED.loja_id;

  DELETE FROM public.caixas WHERE id IN (v_caixa_fechado, v_caixa_aberto, v_caixa_fechado2, v_caixa_gerentec);
  INSERT INTO public.caixas (id, loja_id, operador_id, status, valor_inicial, data_abertura, data_fechamento, valor_fechamento)
  VALUES
    (v_caixa_fechado, v_loja_a, v_operador, 'FECHADO', 100, now() - interval '1 day', now() - interval '1 hour', 150),
    (v_caixa_aberto, v_loja_a, v_operador2, 'ABERTO', 0, now(), NULL, NULL),
    (v_caixa_fechado2, v_loja_a, v_operador, 'FECHADO', 50, now() - interval '1 day', now() - interval '1 hour', 50),
    (v_caixa_gerentec, v_loja_a, v_gerente_c, 'ABERTO', 0, now(), NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.tokens_desconto_gerente WHERE token LIKE 'retc-test-%';
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 1: sem token.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg1$
DECLARE
  v_gerente_a uuid := 'f2000002-0000-4000-8000-000000000001';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  BEGIN
    PERFORM public.retomar_caixa_atomico(v_caixa_fechado, NULL, 'motivo qualquer');
    RAISE EXCEPTION 'RETC_FALHOU: sem token deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RETOMAR_CAIXA_TOKEN_OBRIGATORIO%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 1 OK: sem token negado (%).', SQLERRM;
  END;
END
$neg1$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 2: token inexistente/inválido.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg2$
DECLARE
  v_gerente_a uuid := 'f2000002-0000-4000-8000-000000000001';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  BEGIN
    PERFORM public.retomar_caixa_atomico(v_caixa_fechado, 'retc-test-token-inexistente', 'motivo qualquer');
    RAISE EXCEPTION 'RETC_FALHOU: token invalido deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RETOMAR_CAIXA_TOKEN_INVALIDO%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 2 OK: token invalido negado (%).', SQLERRM;
  END;
END
$neg2$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 3: caixa alvo não está FECHADO.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg3$
DECLARE
  v_gerente_a uuid := 'f2000002-0000-4000-8000-000000000001';
  v_caixa_aberto uuid := 'f2000003-0000-4000-8000-000000000002';
  v_token text := 'retc-test-token-neg3';
BEGIN
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
  VALUES (v_token, now() + interval '5 minutes', false, v_gerente_a);

  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  BEGIN
    PERFORM public.retomar_caixa_atomico(v_caixa_aberto, v_token, 'motivo qualquer');
    RAISE EXCEPTION 'RETC_FALHOU: caixa ABERTO nao deveria poder ser retomado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RETOMAR_CAIXA_NAO_FECHADO%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 3 OK: caixa ABERTO negado (%).', SQLERRM;
  END;
END
$neg3$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 4: GERENTE de outra loja autoriza — negado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg4$
DECLARE
  v_gerente_a uuid := 'f2000002-0000-4000-8000-000000000001';
  v_gerente_b uuid := 'f2000002-0000-4000-8000-000000000002';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
  v_token text := 'retc-test-token-neg4';
BEGIN
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
  VALUES (v_token, now() + interval '5 minutes', false, v_gerente_b);

  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  BEGIN
    PERFORM public.retomar_caixa_atomico(v_caixa_fechado, v_token, 'motivo qualquer');
    RAISE EXCEPTION 'RETC_FALHOU: GERENTE de outra loja nao deveria autorizar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RETOMAR_CAIXA_LOJA_INVALIDA%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 4 OK: GERENTE cross-loja negado (%).', SQLERRM;
  END;
END
$neg4$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 5: requisitante (GERENTE) já tem um caixa ABERTO — negado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg5$
DECLARE
  v_gerente_a uuid := 'f2000002-0000-4000-8000-000000000001';
  v_gerente_c uuid := 'f2000002-0000-4000-8000-000000000007';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
  v_token text := 'retc-test-token-neg5';
BEGIN
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
  VALUES (v_token, now() + interval '5 minutes', false, v_gerente_a);

  -- v_gerente_c já tem v_caixa_gerentec (ABERTO, do setup) — deve ser negado
  -- antes de violar a unique constraint de operador.
  PERFORM set_config('request.jwt.claim.sub', v_gerente_c::text, true);
  BEGIN
    PERFORM public.retomar_caixa_atomico(v_caixa_fechado, v_token, 'motivo qualquer');
    RAISE EXCEPTION 'RETC_FALHOU: requisitante com caixa ABERTO nao deveria conseguir retomar outro';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RETOMAR_CAIXA_OPERADOR_JA_TEM_CAIXA_ABERTO%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 5 OK: requisitante com caixa ABERTO negado (%).', SQLERRM;
  END;
END
$neg5$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 6 (achado Codex #1): OPERADOR como requisitante é negado, mesmo
-- de posse de um token de gerente válido.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg6$
DECLARE
  v_gerente_a uuid := 'f2000002-0000-4000-8000-000000000001';
  v_operador  uuid := 'f2000002-0000-4000-8000-000000000004';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
  v_token text := 'retc-test-token-neg6';
BEGIN
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
  VALUES (v_token, now() + interval '5 minutes', false, v_gerente_a);

  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
  BEGIN
    PERFORM public.retomar_caixa_atomico(v_caixa_fechado, v_token, 'motivo qualquer');
    RAISE EXCEPTION 'RETC_FALHOU: OPERADOR nao deveria conseguir se auto-retomar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RETOMAR_CAIXA_REQUISITANTE_PERFIL%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 6 OK (Codex #1): OPERADOR como requisitante negado (%).', SQLERRM;
  END;

  -- Token não foi consumido pela tentativa negada (falhou antes do anti-replay
  -- ser sequer relevante) — libera para reuso nos próximos testes é irrelevante
  -- aqui, mas confirma que a rejeição aconteceu antes de tocar o token.
  IF EXISTS (SELECT 1 FROM public.tokens_desconto_gerente WHERE token = v_token AND usado = true) THEN
    RAISE EXCEPTION 'RETC_FALHOU: token nao deveria ter sido consumido (falha foi antes da validacao de token)';
  END IF;
END
$neg6$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 7 (achado Codex #3): aprovador do token está inativo — negado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg7$
DECLARE
  v_gerente_a       uuid := 'f2000002-0000-4000-8000-000000000001';
  v_gerente_inativo uuid := 'f2000002-0000-4000-8000-000000000006';
  v_caixa_fechado   uuid := 'f2000003-0000-4000-8000-000000000001';
  v_token text := 'retc-test-token-neg7';
BEGIN
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
  VALUES (v_token, now() + interval '5 minutes', false, v_gerente_inativo);

  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  BEGIN
    PERFORM public.retomar_caixa_atomico(v_caixa_fechado, v_token, 'motivo qualquer');
    RAISE EXCEPTION 'RETC_FALHOU: aprovador inativo nao deveria autorizar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RETOMAR_CAIXA_APROVADOR_INATIVO%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 7 OK (Codex #3): aprovador inativo negado (%).', SQLERRM;
  END;
END
$neg7$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo: fluxo completo — novo caixa criado e vinculado; turno antigo
-- permanece FECHADO e intocado (status/valor_fechamento inalterados).
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos$
DECLARE
  v_gerente_a uuid := 'f2000002-0000-4000-8000-000000000001';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
  v_token text := 'retc-test-token-pos';
  v_resultado record;
  v_status_antigo text;
  v_valor_fechamento_antigo numeric;
BEGIN
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
  VALUES (v_token, now() + interval '5 minutes', false, v_gerente_a);

  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  SELECT * INTO v_resultado FROM public.retomar_caixa_atomico(v_caixa_fechado, v_token, 'sistema travou, retomando turno');

  IF v_resultado.o_novo_caixa_id IS NULL OR v_resultado.o_novo_caixa_id = v_caixa_fechado THEN
    RAISE EXCEPTION 'RETC_FALHOU: deveria retornar um novo caixa_id diferente do antigo';
  END IF;
  IF v_resultado.o_turno_anterior_id <> v_caixa_fechado THEN
    RAISE EXCEPTION 'RETC_FALHOU: turno_anterior_id incorreto';
  END IF;

  -- Turno antigo intocado.
  SELECT status, valor_fechamento INTO v_status_antigo, v_valor_fechamento_antigo
  FROM public.caixas WHERE id = v_caixa_fechado;
  IF v_status_antigo <> 'FECHADO' OR v_valor_fechamento_antigo IS DISTINCT FROM 150 THEN
    RAISE EXCEPTION 'RETC_FALHOU: turno antigo foi mutado (status=%, valor_fechamento=%)', v_status_antigo, v_valor_fechamento_antigo;
  END IF;

  -- Novo turno correto: ABERTO, vinculado, motivo/aprovador gravados.
  IF NOT EXISTS (
    SELECT 1 FROM public.caixas
    WHERE id = v_resultado.o_novo_caixa_id
      AND status = 'ABERTO'
      AND turno_anterior_id = v_caixa_fechado
      AND motivo_retomada = 'sistema travou, retomando turno'
      AND autorizado_por = v_gerente_a
      AND operador_id = v_gerente_a
  ) THEN
    RAISE EXCEPTION 'RETC_FALHOU: novo turno nao gravou os campos esperados';
  END IF;

  -- Token não pode ser reutilizado (anti-replay).
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
    PERFORM public.retomar_caixa_atomico(v_caixa_fechado, v_token, 'segunda tentativa');
    RAISE EXCEPTION 'RETC_FALHOU: token reutilizado deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RETOMAR_CAIXA_TOKEN_INVALIDO%' THEN RAISE; END IF;
    RAISE NOTICE 'Positivo OK (anti-replay): token reutilizado negado (%).', SQLERRM;
  END;

  RAISE NOTICE 'Positivo OK: novo turno % criado, vinculado a %, turno antigo intocado.', v_resultado.o_novo_caixa_id, v_caixa_fechado;
END
$pos$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 8 (achado Codex #2): retomar o MESMO turno fechado uma segunda
-- vez (requisitante diferente, token novo válido) é negado — no máximo
-- um turno retomado por turno fechado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg8$
DECLARE
  v_dono uuid := 'f2000002-0000-4000-8000-000000000003';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
  v_token text := 'retc-test-token-neg8';
BEGIN
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
  VALUES (v_token, now() + interval '5 minutes', false, v_dono);

  PERFORM set_config('request.jwt.claim.sub', v_dono::text, true);
  BEGIN
    PERFORM public.retomar_caixa_atomico(v_caixa_fechado, v_token, 'segunda retomada do mesmo turno fechado');
    RAISE EXCEPTION 'RETC_FALHOU: turno fechado ja retomado nao deveria aceitar segunda retomada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RETOMAR_CAIXA_JA_RETOMADO%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 8 OK (Codex #2): segunda retomada do mesmo turno negada (%).', SQLERRM;
  END;
END
$neg8$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 9 (achado Codex #4): INSERT direto (via `authenticated`, sem
-- passar pela RPC) tentando fabricar uma retomada — negado por grant de
-- coluna, não por RLS.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg9$
DECLARE
  v_gerente_a uuid := 'f2000002-0000-4000-8000-000000000001';
  v_loja_a uuid := 'f2000001-0000-4000-8000-000000000001';
  v_caixa_fechado2 uuid := 'f2000003-0000-4000-8000-000000000003';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.caixas (
      operador_id, loja_id, status, valor_inicial, data_abertura,
      turno_anterior_id, motivo_retomada, autorizado_por
    ) VALUES (
      v_gerente_a, v_loja_a, 'ABERTO', 0, now(),
      v_caixa_fechado2, 'retomada fabricada sem token', v_gerente_a
    );
    RAISE EXCEPTION 'RETC_FALHOU: INSERT direto com colunas de auditoria deveria ser negado';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Negativo 9 OK (Codex #4): INSERT direto nas colunas de auditoria negado por grant (%).', SQLERRM;
  END;
  RESET ROLE;
END
$neg9$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 10 (achado Codex #5): UPDATE direto de status FECHADO→ABERTO é
-- negado pelo trigger de imutabilidade — testado como `authenticated`
-- (papel do gerente, que passaria pela RLS) E como service_role (que
-- bypassa RLS/grants inteiramente), provando que é invariante de trigger.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg10a$
DECLARE
  v_gerente_a uuid := 'f2000002-0000-4000-8000-000000000001';
  v_caixa_fechado2 uuid := 'f2000003-0000-4000-8000-000000000003';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.caixas SET status = 'ABERTO' WHERE id = v_caixa_fechado2;
    RAISE EXCEPTION 'RETC_FALHOU: UPDATE direto FECHADO->ABERTO (authenticated) deveria ser negado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CAIXA_FECHADO_STATUS_IMUTAVEL%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 10a OK (Codex #5): UPDATE direto negado via authenticated (%).', SQLERRM;
  END;
  RESET ROLE;
END
$neg10a$;

DO $neg10b$
DECLARE
  v_caixa_fechado2 uuid := 'f2000003-0000-4000-8000-000000000003';
BEGIN
  -- Limpa claims de sessao anterior — service_role nao deve depender de JWT.
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
  PERFORM set_config('request.jwt.claim.role', NULL, true);
  SET LOCAL ROLE service_role;
  BEGIN
    UPDATE public.caixas SET status = 'ABERTO' WHERE id = v_caixa_fechado2;
    RAISE EXCEPTION 'RETC_FALHOU: UPDATE direto FECHADO->ABERTO (service_role) deveria ser negado pelo trigger';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CAIXA_FECHADO_STATUS_IMUTAVEL%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 10b OK (Codex #5): UPDATE direto negado via service_role — invariante de trigger, nao so RLS/grant (%).', SQLERRM;
  END;
  RESET ROLE;
END
$neg10b$;

ROLLBACK;
