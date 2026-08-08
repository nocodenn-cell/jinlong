-- Migration 278: hardening pré-baseline — revoga EXECUTE de anon/authenticated
--                 em funções sem uso público confirmado.
-- Data: 2026-07-29
--
-- CONTEXTO
-- --------
-- Sequência da migration 277 (C-1). A auditoria do baseline mostrou que o
-- `supabase db pull` transcreve os GRANTs junto com o schema: qualquer permissão
-- indevida que sobrar aqui vira "verdade canônica" no PROD novo. Este é o
-- hardening que precisa existir ANTES do baseline, para que os dois ambientes
-- nasçam idênticos e limpos por construção.
--
-- CAUSA RAIZ (a mesma do C-1)
-- ---------------------------
-- No Postgres, toda função criada nasce com EXECUTE para PUBLIC. Como `anon` e
-- `authenticated` pertencem a PUBLIC, herdam o privilégio. Verificado em
-- pg_proc.proacl: a maioria destas funções tem `=X/postgres` (PUBLIC) e NÃO um
-- grant explícito a `anon` — por isso é obrigatório revogar de PUBLIC **e** de
-- anon; revogar só de anon não teria efeito.
--
-- DEPENDÊNCIAS VERIFICADAS ANTES DE ESCREVER (pg_policies, pg_trigger,
-- pg_get_functiondef, pg_views e grep no código da aplicação):
--
--   auth_usuario_gerencial_loja  → usada em 6 POLICIES RLS.
--     `authenticated` PRESERVADO. Revogar quebraria o acesso de todo usuário
--     logado, porque o Postgres checa EXECUTE do chamador ao avaliar a policy.
--     (Comportamento já observável hoje: `anon` recebe 42501 em `produtos`
--     porque a policy chama auth_usuario_eh_dono.)
--
--   pdv_config_flags_visuais     → 3 chamadas, TODAS autenticadas:
--     app/admin/layout.tsx, app/admin/dashboard/page.tsx e
--     app/caixa/server/registrarAlertasLevesVenda.ts.
--     `authenticated` PRESERVADO.
--
--   fn_criar/atualizar/desativar_funcionario → 0 policies, 0 triggers,
--     0 chamadas por outras funções, 0 chamadas no código.
--     app/admin/funcionarios/actions.ts usa exclusivamente createAdminClient()
--     (service_role). Seguro revogar anon E authenticated.
--
--   fn_audit_update_funcionarios_meta, registrar_historico_preco_produto
--     → funções de TRIGGER (1 trigger cada). O Postgres não exige EXECUTE do
--     usuário para disparar trigger — o privilégio é checado em CREATE TRIGGER.
--     Seguro revogar ambos.
--
--   venda_eventos_items_from_payload/from_sale, calcular_promocao_aplicavel
--     → chamadas de dentro de funções SECURITY DEFINER (owner = postgres);
--     nesse caminho o privilégio é checado contra postgres, não contra o
--     chamador. 0 chamadas diretas no código. Seguro revogar ambos.
--
--   RPCs legadas de venda (v2 em 4 assinaturas, v3 em 2, finalizar_venda_
--   transacional de 7 args) → corpo contém LEGACY_DISABLED_USE_V4 e
--   scripts/rpc-gate-guard.mjs proíbe qualquer referência no código de
--   produção. Falham fechado hoje; passam a falhar com 42501. Seguro.
--
-- DELIBERADAMENTE FORA DO ESCOPO
-- ------------------------------
--   finalizar_venda_transacional(uuid,uuid,text,numeric,numeric,numeric,jsonb,
--   text,numeric) — a de 9 argumentos. NÃO é LEGACY_DISABLED (é SECURITY
--   DEFINER ativa) e `anon` já está negado. Não foi possível provar ausência
--   de uso; fica INTACTA para verificação posterior.
--
-- ESCOPO
-- ------
-- Apenas DDL de permissão. NENHUM corpo de função alterado. NENHUMA função
-- removida (DROP fica para depois do baseline, após checagem de dependências).
-- `service_role` PRESERVADO em todas.
--
-- ROLLBACK
-- --------
--   GRANT EXECUTE ON FUNCTION public.<assinatura> TO anon;          -- e/ou
--   GRANT EXECUTE ON FUNCTION public.<assinatura> TO authenticated;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRUPO A — revogar apenas `anon`; `authenticated` é NECESSÁRIO
-- ═══════════════════════════════════════════════════════════════════════════

-- Usada em 6 policies RLS. authenticated PRESERVADO.
REVOKE ALL ON FUNCTION public.auth_usuario_gerencial_loja(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_usuario_gerencial_loja(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_usuario_gerencial_loja(uuid) TO authenticated, service_role;

-- 3 chamadas autenticadas no app. authenticated PRESERVADO.
-- Greenfield: `235_*` (criação) ordena depois desta migration; 311 reaplica grants.
DO $guard_pdv_config_flags$
BEGIN
  IF to_regprocedure('public.pdv_config_flags_visuais()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.pdv_config_flags_visuais() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.pdv_config_flags_visuais() FROM anon;
    GRANT EXECUTE ON FUNCTION public.pdv_config_flags_visuais() TO authenticated, service_role;
  END IF;
END
$guard_pdv_config_flags$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRUPO B — CRUD de funcionários: app usa service_role exclusivamente
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.fn_criar_funcionario(uuid,uuid,text,text,text,numeric,text,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_criar_funcionario(uuid,uuid,text,text,text,numeric,text,numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_criar_funcionario(uuid,uuid,text,text,text,numeric,text,numeric) TO service_role;

REVOKE ALL ON FUNCTION public.fn_atualizar_funcionario(uuid,text,text,numeric,text,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_atualizar_funcionario(uuid,text,text,numeric,text,numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_funcionario(uuid,text,text,numeric,text,numeric) TO service_role;

REVOKE ALL ON FUNCTION public.fn_desativar_funcionario(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_desativar_funcionario(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_desativar_funcionario(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRUPO C — funções de TRIGGER (EXECUTE não é checado ao disparar)
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.fn_audit_update_funcionarios_meta() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_audit_update_funcionarios_meta() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_audit_update_funcionarios_meta() TO service_role;

REVOKE ALL ON FUNCTION public.registrar_historico_preco_produto() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_historico_preco_produto() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_historico_preco_produto() TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRUPO D — helpers internos chamados de dentro de SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.venda_eventos_items_from_payload(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venda_eventos_items_from_payload(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venda_eventos_items_from_payload(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.venda_eventos_items_from_sale(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venda_eventos_items_from_sale(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venda_eventos_items_from_sale(uuid) TO service_role;

-- BL-2: resolvida internamente pela v4 (SECURITY DEFINER). Sem chamada direta.
REVOKE ALL ON FUNCTION public.calcular_promocao_aplicavel(uuid,uuid,numeric,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calcular_promocao_aplicavel(uuid,uuid,numeric,timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_promocao_aplicavel(uuid,uuid,numeric,timestamptz) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRUPO E — RPCs legadas de venda (corpo LEGACY_DISABLED_USE_V4)
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional(uuid,uuid,text,numeric,numeric,numeric,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_venda_transacional(uuid,uuid,text,numeric,numeric,numeric,jsonb) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v2() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v2() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v2(uuid,uuid,uuid,jsonb,jsonb,numeric,numeric,numeric,text,numeric,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v2(uuid,uuid,uuid,jsonb,jsonb,numeric,numeric,numeric,text,numeric,text) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v2(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v2(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v2(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v2(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,text) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v3() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v3() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v3(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v3(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text) FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
