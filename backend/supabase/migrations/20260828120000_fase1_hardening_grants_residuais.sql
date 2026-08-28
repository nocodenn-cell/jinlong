-- Fase 1 do plano de remediação Jīn Lóng — hardening de grants sem alteração
-- funcional. Consolida achados já documentados e ainda abertos em:
--   docs/AUDITORIA_HARDENING_PRE_BASELINE.md (item aberto #3 — 22 funções
--   SECURITY INVOKER alcançáveis por anon) e docs/AUDITORIA_INFRA_GO_LIVE_
--   FASE2.md (P2-5 — trigger functions expostas como RPC via PostgREST).
--
-- Verificado ao vivo em produção antes de escrever (SELECT apenas, nenhuma
-- alteração) via has_function_privilege / pg_trigger / pg_proc.prosecdef.
--
-- ESCOPO — só GRANT/REVOKE. Nenhum corpo de função alterado. Nenhuma função
-- removida. `service_role` preservado em todas.
--
-- GRUPO A — 2 RPCs SECURITY DEFINER com EXECUTE a `anon` desnecessário.
--   Já seguras hoje: `auth.uid()` é NULL para `anon` e ambas lançam exceção
--   ('sessao_expirada') antes de qualquer efeito. Revogar reduz superfície —
--   mesma classe de função (SECURITY DEFINER + sessão) que causou o C-1
--   histórico quando um grant a anon sobrou por regressão de CREATE OR REPLACE.
--   `authenticated` PRESERVADO (uso real: retomar/devolver venda em espera).
--
-- GRUPO B — funções utilitárias e de TRIGGER sem chamador via API, com
--   EXECUTE a `anon` E `authenticated`. Revogar ambos é seguro: o Postgres
--   checa privilégio de EXECUTE em CREATE TRIGGER, não ao disparar — já
--   comprovado empiricamente na migration 20260731201100 (UPDATE disparou
--   trigger mesmo após revoke, sob role authenticated).
--
-- GRUPO C — RPCs "relatório"/"dashboard" (SECURITY INVOKER) com EXECUTE a
--   `anon` herdado de PUBLIC na criação, nunca revogado. `authenticated`
--   PRESERVADO — são as RPCs reais usadas pelas telas /gerente/relatorios e
--   /gerente/dashboard. `anon` não tem grant de tabela nenhuma (migration
--   219), então já falha na prática; isto fecha a última camada (RPC).
--
-- GRUPO D — 7 trigger functions expostas como RPC via PostgREST com EXECUTE
--   a `authenticated` (P2-5, AUDITORIA_INFRA_GO_LIVE_FASE2.md, confirmado
--   ainda aberto ao vivo). Chamar `/rest/v1/rpc/trg_fn_vendas_caixa_aberto`
--   ou similar direto nunca foi o uso pretendido — são gatilhos de UPDATE/
--   INSERT em produtos/precos_atacado/regras_preco/vendas/itens_venda.
--   Revogar `authenticated` não afeta o disparo do trigger (mesma garantia
--   do Grupo B). `anon` já não tinha acesso a estas.
--
-- ROLLBACK
-- --------
--   GRANT EXECUTE ON FUNCTION public.<assinatura> TO anon;          -- Grupos A/C
--   GRANT EXECUTE ON FUNCTION public.<assinatura> TO anon, authenticated; -- Grupo B
--   GRANT EXECUTE ON FUNCTION public.<assinatura> TO authenticated; -- Grupo D

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRUPO A — SECURITY DEFINER, EXECUTE de anon desnecessário (authenticated preservado)
-- ═══════════════════════════════════════════════════════════════════════════

DO $grupo_a$
BEGIN
  IF to_regprocedure('public.converter_venda_em_espera(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.converter_venda_em_espera(uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.converter_venda_em_espera(uuid) FROM anon;
    GRANT EXECUTE ON FUNCTION public.converter_venda_em_espera(uuid) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.devolver_venda_em_espera(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.devolver_venda_em_espera(uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.devolver_venda_em_espera(uuid) FROM anon;
    GRANT EXECUTE ON FUNCTION public.devolver_venda_em_espera(uuid) TO authenticated, service_role;
  END IF;
END
$grupo_a$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRUPO B — utilitários/trigger sem chamador via API: revoga anon E authenticated
-- ═══════════════════════════════════════════════════════════════════════════

DO $grupo_b$
BEGIN
  IF to_regprocedure('public.oc_set_updated_at()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.oc_set_updated_at() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.oc_set_updated_at() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.oc_set_updated_at() TO service_role;
  END IF;

  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
  END IF;

  IF to_regprocedure('public.trg_caixas_saldo_inicial()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.trg_caixas_saldo_inicial() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.trg_caixas_saldo_inicial() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.trg_caixas_saldo_inicial() TO service_role;
  END IF;

  IF to_regprocedure('public.update_feature_flags_updated_at()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.update_feature_flags_updated_at() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.update_feature_flags_updated_at() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.update_feature_flags_updated_at() TO service_role;
  END IF;

  IF to_regprocedure('public.relatorio_settings_normalize_timezone()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.relatorio_settings_normalize_timezone() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.relatorio_settings_normalize_timezone() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.relatorio_settings_normalize_timezone() TO service_role;
  END IF;

  -- Helpers internos sem chamador direto no código (grep confirmado: nenhum
  -- `.rpc('round_abnt'` / `.rpc('venda_evento_idempotency_key'` no app).
  IF to_regprocedure('public.round_abnt(numeric,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.round_abnt(numeric,integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.round_abnt(numeric,integer) FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.round_abnt(numeric,integer) TO service_role;
  END IF;

  IF to_regprocedure('public.venda_evento_idempotency_key(text,uuid,boolean)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.venda_evento_idempotency_key(text,uuid,boolean) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.venda_evento_idempotency_key(text,uuid,boolean) FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.venda_evento_idempotency_key(text,uuid,boolean) TO service_role;
  END IF;
END
$grupo_b$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRUPO C — RPCs de relatório/dashboard: revoga só anon, authenticated preservado
-- ═══════════════════════════════════════════════════════════════════════════

DO $grupo_c$
BEGIN
  IF to_regprocedure('public.dashboard_gerente_resumo(uuid,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.dashboard_gerente_resumo(uuid,text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.dashboard_gerente_resumo(uuid,text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.dashboard_gerente_resumo(uuid,text) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.detalhe_comissoes_operador(uuid,uuid,date,date)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.detalhe_comissoes_operador(uuid,uuid,date,date) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.detalhe_comissoes_operador(uuid,uuid,date,date) FROM anon;
    GRANT EXECUTE ON FUNCTION public.detalhe_comissoes_operador(uuid,uuid,date,date) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.gerente_estoque_list_page(uuid,text,text,uuid,text,text,boolean,integer,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.gerente_estoque_list_page(uuid,text,text,uuid,text,text,boolean,integer,integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.gerente_estoque_list_page(uuid,text,text,uuid,text,text,boolean,integer,integer) FROM anon;
    GRANT EXECUTE ON FUNCTION public.gerente_estoque_list_page(uuid,text,text,uuid,text,text,boolean,integer,integer) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.relatorio_cobertura_estoque(integer,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.relatorio_cobertura_estoque(integer,integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.relatorio_cobertura_estoque(integer,integer) FROM anon;
    GRANT EXECUTE ON FUNCTION public.relatorio_cobertura_estoque(integer,integer) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.relatorio_curva_abc_periodo(date,date,text,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.relatorio_curva_abc_periodo(date,date,text,integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.relatorio_curva_abc_periodo(date,date,text,integer) FROM anon;
    GRANT EXECUTE ON FUNCTION public.relatorio_curva_abc_periodo(date,date,text,integer) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.relatorio_margem_por_venda_periodo(date,date,text,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.relatorio_margem_por_venda_periodo(date,date,text,integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.relatorio_margem_por_venda_periodo(date,date,text,integer) FROM anon;
    GRANT EXECUTE ON FUNCTION public.relatorio_margem_por_venda_periodo(date,date,text,integer) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.relatorio_produtos_sem_giro_periodo(uuid,timestamptz,timestamptz)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.relatorio_produtos_sem_giro_periodo(uuid,timestamptz,timestamptz) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.relatorio_produtos_sem_giro_periodo(uuid,timestamptz,timestamptz) FROM anon;
    GRANT EXECUTE ON FUNCTION public.relatorio_produtos_sem_giro_periodo(uuid,timestamptz,timestamptz) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.relatorio_resumo_executivo_periodo(date,date,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.relatorio_resumo_executivo_periodo(date,date,text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.relatorio_resumo_executivo_periodo(date,date,text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.relatorio_resumo_executivo_periodo(date,date,text) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.relatorio_top_produtos_periodo(date,date,integer,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.relatorio_top_produtos_periodo(date,date,integer,text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.relatorio_top_produtos_periodo(date,date,integer,text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.relatorio_top_produtos_periodo(date,date,integer,text) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.relatorio_tz_validado(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.relatorio_tz_validado(text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.relatorio_tz_validado(text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.relatorio_tz_validado(text) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.relatorio_vendas_por_dia_periodo(date,date,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.relatorio_vendas_por_dia_periodo(date,date,text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.relatorio_vendas_por_dia_periodo(date,date,text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.relatorio_vendas_por_dia_periodo(date,date,text) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.resumo_comissoes_por_operador(uuid,date,date,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.resumo_comissoes_por_operador(uuid,date,date,text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.resumo_comissoes_por_operador(uuid,date,date,text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.resumo_comissoes_por_operador(uuid,date,date,text) TO authenticated, service_role;
  END IF;
END
$grupo_c$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRUPO D — trigger functions expostas via PostgREST (P2-5): revoga authenticated
-- ═══════════════════════════════════════════════════════════════════════════

DO $grupo_d$
BEGIN
  IF to_regprocedure('public.tg_documentos_fiscais_eventos_ai()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_eventos_ai() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_eventos_ai() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.tg_documentos_fiscais_eventos_ai() TO service_role;
  END IF;

  IF to_regprocedure('public.tg_documentos_fiscais_eventos_au()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_eventos_au() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.tg_documentos_fiscais_eventos_au() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.tg_documentos_fiscais_eventos_au() TO service_role;
  END IF;

  IF to_regprocedure('public.trg_fn_itens_venda_limite_desconto()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.trg_fn_itens_venda_limite_desconto() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.trg_fn_itens_venda_limite_desconto() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.trg_fn_itens_venda_limite_desconto() TO service_role;
  END IF;

  IF to_regprocedure('public.trg_fn_precos_atacado_margem()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.trg_fn_precos_atacado_margem() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.trg_fn_precos_atacado_margem() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.trg_fn_precos_atacado_margem() TO service_role;
  END IF;

  IF to_regprocedure('public.trg_fn_produtos_margem()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.trg_fn_produtos_margem() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.trg_fn_produtos_margem() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.trg_fn_produtos_margem() TO service_role;
  END IF;

  IF to_regprocedure('public.trg_fn_regras_preco_margem()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.trg_fn_regras_preco_margem() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.trg_fn_regras_preco_margem() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.trg_fn_regras_preco_margem() TO service_role;
  END IF;

  IF to_regprocedure('public.trg_fn_vendas_caixa_aberto()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.trg_fn_vendas_caixa_aberto() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.trg_fn_vendas_caixa_aberto() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.trg_fn_vendas_caixa_aberto() TO service_role;
  END IF;
END
$grupo_d$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — falha a transação se algum revoke não pegou
-- ═══════════════════════════════════════════════════════════════════════════

DO $verify$
BEGIN
  IF to_regprocedure('public.converter_venda_em_espera(uuid)') IS NOT NULL
     AND has_function_privilege('anon', 'public.converter_venda_em_espera(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FASE1_GRUPO_A_ANON_REMANESCENTE: converter_venda_em_espera';
  END IF;
  IF to_regprocedure('public.devolver_venda_em_espera(uuid)') IS NOT NULL
     AND has_function_privilege('anon', 'public.devolver_venda_em_espera(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FASE1_GRUPO_A_ANON_REMANESCENTE: devolver_venda_em_espera';
  END IF;
  IF to_regprocedure('public.converter_venda_em_espera(uuid)') IS NOT NULL
     AND NOT has_function_privilege('authenticated', 'public.converter_venda_em_espera(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FASE1_GRUPO_A_AUTHENTICATED_PERDIDO: converter_venda_em_espera';
  END IF;

  IF to_regprocedure('public.set_updated_at()') IS NOT NULL
     AND (has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE')
          OR has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE')) THEN
    RAISE EXCEPTION 'FASE1_GRUPO_B_REMANESCENTE: set_updated_at';
  END IF;

  IF to_regprocedure('public.relatorio_vendas_por_dia_periodo(date,date,text)') IS NOT NULL
     AND has_function_privilege('anon', 'public.relatorio_vendas_por_dia_periodo(date,date,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FASE1_GRUPO_C_ANON_REMANESCENTE: relatorio_vendas_por_dia_periodo';
  END IF;
  IF to_regprocedure('public.relatorio_vendas_por_dia_periodo(date,date,text)') IS NOT NULL
     AND NOT has_function_privilege('authenticated', 'public.relatorio_vendas_por_dia_periodo(date,date,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FASE1_GRUPO_C_AUTHENTICATED_PERDIDO: relatorio_vendas_por_dia_periodo';
  END IF;

  IF to_regprocedure('public.trg_fn_vendas_caixa_aberto()') IS NOT NULL
     AND has_function_privilege('authenticated', 'public.trg_fn_vendas_caixa_aberto()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FASE1_GRUPO_D_AUTHENTICATED_REMANESCENTE: trg_fn_vendas_caixa_aberto';
  END IF;

  RAISE NOTICE 'FASE1 hardening de grants OK — grupos A, B, C, D verificados no efeito';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
