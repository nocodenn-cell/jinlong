-- Regressão da migration 20260828120000_fase1_hardening_grants_residuais.sql
-- (Fase 1 do plano de remediação Jīn Lóng).
--
-- Não reprova o postgres: privilégio de EXECUTE é checado em CREATE TRIGGER,
-- não ao disparar (fato de linguagem, já comprovado empiricamente na migration
-- 20260731201100 para registrar_historico_preco_produto). Este teste foca no
-- efeito de DDL que a migration realmente muda: quem tem EXECUTE em cada
-- função, nos 4 grupos.
--
-- Roda dentro de uma transação com ROLLBACK — não persiste nada.

\set ON_ERROR_STOP on
BEGIN;

DO $fase1_check$
DECLARE
  v_fn text;
  v_fail text[] := ARRAY[]::text[];
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- GRUPO A — anon=false, authenticated=true
  -- ═══════════════════════════════════════════════════════════════════════
  FOREACH v_fn IN ARRAY ARRAY[
    'public.converter_venda_em_espera(uuid)',
    'public.devolver_venda_em_espera(uuid)'
  ]
  LOOP
    IF to_regprocedure(v_fn) IS NULL THEN CONTINUE; END IF;
    IF has_function_privilege('anon', to_regprocedure(v_fn), 'EXECUTE') THEN
      v_fail := array_append(v_fail, v_fn || ': anon deveria ser false');
    END IF;
    IF NOT has_function_privilege('authenticated', to_regprocedure(v_fn), 'EXECUTE') THEN
      v_fail := array_append(v_fail, v_fn || ': authenticated deveria ser true');
    END IF;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- GRUPO B — anon=false, authenticated=false (utilitário/trigger sem uso via API)
  -- ═══════════════════════════════════════════════════════════════════════
  FOREACH v_fn IN ARRAY ARRAY[
    'public.oc_set_updated_at()',
    'public.set_updated_at()',
    'public.trg_caixas_saldo_inicial()',
    'public.update_feature_flags_updated_at()',
    'public.relatorio_settings_normalize_timezone()',
    'public.round_abnt(numeric,integer)',
    'public.venda_evento_idempotency_key(text,uuid,boolean)'
  ]
  LOOP
    IF to_regprocedure(v_fn) IS NULL THEN CONTINUE; END IF;
    IF has_function_privilege('anon', to_regprocedure(v_fn), 'EXECUTE')
       OR has_function_privilege('authenticated', to_regprocedure(v_fn), 'EXECUTE') THEN
      v_fail := array_append(v_fail, v_fn || ': anon/authenticated deveriam ser false');
    END IF;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- GRUPO C — anon=false, authenticated=true (RPCs de relatório/dashboard)
  -- ═══════════════════════════════════════════════════════════════════════
  FOREACH v_fn IN ARRAY ARRAY[
    'public.dashboard_gerente_resumo(uuid,text)',
    'public.detalhe_comissoes_operador(uuid,uuid,date,date)',
    'public.gerente_estoque_list_page(uuid,text,text,uuid,text,text,boolean,integer,integer)',
    'public.relatorio_cobertura_estoque(integer,integer)',
    'public.relatorio_curva_abc_periodo(date,date,text,integer)',
    'public.relatorio_margem_por_venda_periodo(date,date,text,integer)',
    'public.relatorio_produtos_sem_giro_periodo(uuid,timestamptz,timestamptz)',
    'public.relatorio_resumo_executivo_periodo(date,date,text)',
    'public.relatorio_top_produtos_periodo(date,date,integer,text)',
    'public.relatorio_tz_validado(text)',
    'public.relatorio_vendas_por_dia_periodo(date,date,text)',
    'public.resumo_comissoes_por_operador(uuid,date,date,text)'
  ]
  LOOP
    IF to_regprocedure(v_fn) IS NULL THEN CONTINUE; END IF;
    IF has_function_privilege('anon', to_regprocedure(v_fn), 'EXECUTE') THEN
      v_fail := array_append(v_fail, v_fn || ': anon deveria ser false');
    END IF;
    IF NOT has_function_privilege('authenticated', to_regprocedure(v_fn), 'EXECUTE') THEN
      v_fail := array_append(v_fail, v_fn || ': authenticated deveria ser true');
    END IF;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- GRUPO D — anon=false, authenticated=false (trigger functions expostas, P2-5)
  -- ═══════════════════════════════════════════════════════════════════════
  FOREACH v_fn IN ARRAY ARRAY[
    'public.tg_documentos_fiscais_eventos_ai()',
    'public.tg_documentos_fiscais_eventos_au()',
    'public.trg_fn_itens_venda_limite_desconto()',
    'public.trg_fn_precos_atacado_margem()',
    'public.trg_fn_produtos_margem()',
    'public.trg_fn_regras_preco_margem()',
    'public.trg_fn_vendas_caixa_aberto()'
  ]
  LOOP
    IF to_regprocedure(v_fn) IS NULL THEN CONTINUE; END IF;
    IF has_function_privilege('anon', to_regprocedure(v_fn), 'EXECUTE')
       OR has_function_privilege('authenticated', to_regprocedure(v_fn), 'EXECUTE') THEN
      v_fail := array_append(v_fail, v_fn || ': anon/authenticated deveriam ser false');
    END IF;
  END LOOP;

  IF array_length(v_fail, 1) > 0 THEN
    RAISE EXCEPTION 'FASE1_HARDENING_GRANTS_FALHOU: %', array_to_string(v_fail, ' | ');
  END IF;

  RAISE NOTICE 'FASE1 hardening de grants: todos os grupos A/B/C/D no estado esperado.';
END
$fase1_check$;

-- Prova empírica complementar (mesmo raciocínio da migration 20260731201100):
-- o trigger de margem de produtos continua disparando sob `authenticated` mesmo
-- após revogar EXECUTE de trg_fn_produtos_margem — o privilégio só é checado em
-- CREATE TRIGGER. Usa um produto real e reverte no ROLLBACK final.
DO $trigger_ainda_dispara$
DECLARE
  v_produto_id uuid;
  v_gerente uuid;
  v_preco_antes numeric;
BEGIN
  IF to_regprocedure('public.trg_fn_produtos_margem()') IS NULL THEN
    RETURN;
  END IF;

  SELECT p.id, p.preco_varejo INTO v_produto_id, v_preco_antes
  FROM public.produtos p
  WHERE p.preco_custo IS NOT NULL AND p.preco_varejo > p.preco_custo
  LIMIT 1;

  IF v_produto_id IS NULL THEN
    RAISE NOTICE 'Sem produto elegível para prova empírica do trigger — pulando (não é falha).';
    RETURN;
  END IF;

  SELECT u.id INTO v_gerente FROM public.usuarios u WHERE u.ativo AND u.perfil IN ('GERENTE','DONO','ADMIN') LIMIT 1;
  IF v_gerente IS NULL THEN
    RAISE NOTICE 'Sem usuário GERENTE/DONO/ADMIN elegível para prova empírica do trigger — pulando (não é falha).';
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  -- Update inócuo (mesmo valor) só para provar que o trigger dispara sem erro
  -- de permissão, mesmo com EXECUTE revogado de trg_fn_produtos_margem.
  UPDATE public.produtos SET preco_varejo = v_preco_antes WHERE id = v_produto_id;

  RESET ROLE;
  RAISE NOTICE 'Trigger trg_fn_produtos_margem disparou sob authenticated após revoke — confirmado.';
END
$trigger_ainda_dispara$;

SELECT 'FASE1 HARDENING GRANTS RESIDUAIS: OK' AS resultado;
ROLLBACK;
