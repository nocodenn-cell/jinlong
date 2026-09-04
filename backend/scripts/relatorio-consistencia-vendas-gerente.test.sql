-- Item 23 do Plano Mestre de Fechamento dos Gaps.
--
-- Prova que relatorio_consistencia_vendas_gerente: (1) nega para quem não é
-- GERENTE/DONO/ADMIN; (2) nega para GERENTE tentando consultar um caixa de
-- outra loja; (3) funciona para GERENTE da própria loja; (4) funciona para
-- DONO consultando cross-loja (Padrão A, escopo global); (5) NUNCA abre a
-- função original (Gate 9 continua intacto — checado também no bloco
-- $verify$ da própria migration, aqui é prova em runtime).
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK — não persiste
-- nada em produção.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja_a    uuid := 'd1000001-0000-4000-8000-000000000001';
  v_loja_b    uuid := 'd1000001-0000-4000-8000-000000000002';
  v_gerente_a uuid := 'd1000002-0000-4000-8000-000000000001';
  v_operador  uuid := 'd1000002-0000-4000-8000-000000000002';
  v_dono      uuid := 'd1000002-0000-4000-8000-000000000003';
  v_operador_b uuid := 'd1000002-0000-4000-8000-000000000004';
  v_caixa_a   uuid := 'd1000003-0000-4000-8000-000000000001';
  v_caixa_b   uuid := 'd1000003-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente_a), (v_operador), (v_dono), (v_operador_b)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES
    (v_loja_a, 'RCVG Loja A', 'RCVG-A', true),
    (v_loja_b, 'RCVG Loja B', 'RCVG-B', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (v_gerente_a, 'RCVG Gerente A', 'GERENTE', true, v_loja_a),
    (v_operador, 'RCVG Operador', 'OPERADOR', true, v_loja_a),
    (v_dono, 'RCVG Dono', 'DONO', true, v_loja_a),
    (v_operador_b, 'RCVG Operador B', 'OPERADOR', true, v_loja_b)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  DELETE FROM public.caixas WHERE id IN (v_caixa_a, v_caixa_b);
  INSERT INTO public.caixas (id, loja_id, operador_id, status, valor_inicial, data_abertura)
  VALUES
    (v_caixa_a, v_loja_a, v_gerente_a, 'ABERTO', 0, now()),
    (v_caixa_b, v_loja_b, v_operador_b, 'ABERTO', 0, now())
  ON CONFLICT (id) DO NOTHING;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 1: OPERADOR (perfil sem acesso) é negado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg1$
DECLARE
  v_operador uuid := 'd1000002-0000-4000-8000-000000000002';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_operador::text, true);
  BEGIN
    PERFORM public.relatorio_consistencia_vendas_gerente();
    RAISE EXCEPTION 'RCVG_FALHOU: OPERADOR deveria ser negado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RELATORIO_CONSISTENCIA_PERFIL%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 1 OK: OPERADOR negado (%).', SQLERRM;
  END;
END
$neg1$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 2: GERENTE da loja A tentando consultar caixa da loja B é negado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg2$
DECLARE
  v_gerente_a uuid := 'd1000002-0000-4000-8000-000000000001';
  v_caixa_b   uuid := 'd1000003-0000-4000-8000-000000000002';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  BEGIN
    PERFORM public.relatorio_consistencia_vendas_gerente(v_caixa_b);
    RAISE EXCEPTION 'RCVG_FALHOU: GERENTE cross-loja deveria ser negado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'RELATORIO_CONSISTENCIA_LOJA_INVALIDA%' THEN RAISE; END IF;
    RAISE NOTICE 'Negativo 2 OK: GERENTE cross-loja negado (%).', SQLERRM;
  END;
END
$neg2$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo 1: GERENTE consulta a própria loja (sem caixa específico) — ok.
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos1$
DECLARE
  v_gerente_a uuid := 'd1000002-0000-4000-8000-000000000001';
  v_result    record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  SELECT * INTO v_result FROM public.relatorio_consistencia_vendas_gerente() LIMIT 1;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'RCVG_FALHOU: GERENTE deveria receber uma linha de relatorio (mesmo que zerada)';
  END IF;
  RAISE NOTICE 'Positivo 1 OK: GERENTE consultou a propria loja (total_vendas=%).', v_result.total_vendas;
END
$pos1$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo 2: DONO consulta cross-loja (escopo global, Padrão A) — ok.
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos2$
DECLARE
  v_dono    uuid := 'd1000002-0000-4000-8000-000000000003';
  v_caixa_b uuid := 'd1000003-0000-4000-8000-000000000002';
  v_result  record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_dono::text, true);
  SELECT * INTO v_result FROM public.relatorio_consistencia_vendas_gerente(v_caixa_b) LIMIT 1;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'RCVG_FALHOU: DONO deveria conseguir consultar caixa de qualquer loja';
  END IF;
  RAISE NOTICE 'Positivo 2 OK: DONO consultou caixa cross-loja (total_vendas=%).', v_result.total_vendas;
END
$pos2$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 3 (Gate 9 continua intacto): authenticated/anon não ganham
-- EXECUTE na função original por causa do wrapper.
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg3$
DECLARE
  v_authenticated boolean;
  v_anon boolean;
BEGIN
  v_authenticated := has_function_privilege('authenticated', 'public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)', 'EXECUTE');
  v_anon := has_function_privilege('anon', 'public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)', 'EXECUTE');
  IF v_authenticated OR v_anon THEN
    RAISE EXCEPTION 'RCVG_FALHOU: GATE 9 quebrado — funcao original ganhou EXECUTE (authenticated=%, anon=%)', v_authenticated, v_anon;
  END IF;
  RAISE NOTICE 'Negativo 3 OK: Gate 9 intacto — relatorio_consistencia_vendas original continua service_role-only.';
END
$neg3$;

ROLLBACK;
