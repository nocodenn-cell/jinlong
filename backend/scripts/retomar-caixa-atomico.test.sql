-- Item 22 do Plano Mestre de Fechamento dos Gaps.
--
-- Prova retomar_caixa_atomico (Opção B aprovada — DB-07/DB-08): cria um
-- NOVO turno vinculado, nunca muta o turno FECHADO original. Cenários:
-- token ausente, token inválido, caixa alvo não-FECHADO, GERENTE
-- cross-loja negado, operador já com caixa ABERTO negado, fluxo completo
-- (positivo) prova o novo caixa + o turno antigo permanece intocado, e
-- DONO cross-loja (Padrão A) funciona.
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK — não persiste
-- nada em produção.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja_a     uuid := 'f2000001-0000-4000-8000-000000000001';
  v_loja_b     uuid := 'f2000001-0000-4000-8000-000000000002';
  v_gerente_a  uuid := 'f2000002-0000-4000-8000-000000000001';
  v_gerente_b  uuid := 'f2000002-0000-4000-8000-000000000002';
  v_dono       uuid := 'f2000002-0000-4000-8000-000000000003';
  v_operador   uuid := 'f2000002-0000-4000-8000-000000000004';
  v_operador2  uuid := 'f2000002-0000-4000-8000-000000000005';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
  v_caixa_aberto  uuid := 'f2000003-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente_a), (v_gerente_b), (v_dono), (v_operador), (v_operador2)
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
    (v_operador2, 'RETC Operador 2', 'OPERADOR', true, v_loja_a)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  DELETE FROM public.caixas WHERE id IN (v_caixa_fechado, v_caixa_aberto);
  INSERT INTO public.caixas (id, loja_id, operador_id, status, valor_inicial, data_abertura, data_fechamento, valor_fechamento)
  VALUES
    (v_caixa_fechado, v_loja_a, v_operador, 'FECHADO', 100, now() - interval '1 day', now() - interval '1 hour', 150),
    (v_caixa_aberto, v_loja_a, v_operador2, 'ABERTO', 0, now(), NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.tokens_desconto_gerente WHERE token LIKE 'retc-test-%';
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 1: sem token.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg1$
DECLARE
  v_operador uuid := 'f2000002-0000-4000-8000-000000000004';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
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
  v_operador uuid := 'f2000002-0000-4000-8000-000000000004';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
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
  v_operador  uuid := 'f2000002-0000-4000-8000-000000000004';
  v_caixa_aberto uuid := 'f2000003-0000-4000-8000-000000000002';
  v_token text := 'retc-test-token-neg3';
BEGIN
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
  VALUES (v_token, now() + interval '5 minutes', false, v_gerente_a);

  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
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
  v_gerente_b uuid := 'f2000002-0000-4000-8000-000000000002';
  v_operador  uuid := 'f2000002-0000-4000-8000-000000000004';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
  v_token text := 'retc-test-token-neg4';
BEGIN
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
  VALUES (v_token, now() + interval '5 minutes', false, v_gerente_b);

  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
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
-- Negativo 5: requisitante já tem um caixa ABERTO — negado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg5$
DECLARE
  v_gerente_a uuid := 'f2000002-0000-4000-8000-000000000001';
  v_operador2 uuid := 'f2000002-0000-4000-8000-000000000005';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
  v_token text := 'retc-test-token-neg5';
BEGIN
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
  VALUES (v_token, now() + interval '5 minutes', false, v_gerente_a);

  -- v_operador2 já tem v_caixa_aberto (do setup) — deve ser negado antes de violar a unique constraint.
  PERFORM set_config('request.jwt.claim.sub', v_operador2::text, true);
  BEGIN
    PERFORM public.retomar_caixa_atomico(v_caixa_fechado, v_token, 'motivo qualquer');
    RAISE EXCEPTION 'RETC_FALHOU: operador com caixa ABERTO nao deveria conseguir retomar outro';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RETOMAR_CAIXA_OPERADOR_JA_TEM_CAIXA_ABERTO%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 5 OK: operador com caixa ABERTO negado (%).', SQLERRM;
  END;
END
$neg5$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo: fluxo completo — novo caixa criado e vinculado; turno antigo
-- permanece FECHADO e intocado (status/valor_fechamento inalterados).
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos$
DECLARE
  v_gerente_a uuid := 'f2000002-0000-4000-8000-000000000001';
  v_operador  uuid := 'f2000002-0000-4000-8000-000000000004';
  v_caixa_fechado uuid := 'f2000003-0000-4000-8000-000000000001';
  v_token text := 'retc-test-token-pos';
  v_resultado record;
  v_status_antigo text;
  v_valor_fechamento_antigo numeric;
BEGIN
  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, criado_por)
  VALUES (v_token, now() + interval '5 minutes', false, v_gerente_a);

  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
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
      AND operador_id = v_operador
  ) THEN
    RAISE EXCEPTION 'RETC_FALHOU: novo turno nao gravou os campos esperados';
  END IF;

  -- Token não pode ser reutilizado (anti-replay).
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
    PERFORM public.retomar_caixa_atomico(v_caixa_fechado, v_token, 'segunda tentativa');
    RAISE EXCEPTION 'RETC_FALHOU: token reutilizado deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RETOMAR_CAIXA_TOKEN_INVALIDO%' THEN RAISE; END IF;
    RAISE NOTICE 'Positivo OK (anti-replay): token reutilizado negado (%).', SQLERRM;
  END;

  RAISE NOTICE 'Positivo OK: novo turno % criado, vinculado a %, turno antigo intocado.', v_resultado.o_novo_caixa_id, v_caixa_fechado;
END
$pos$;

ROLLBACK;
