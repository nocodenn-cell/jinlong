-- Migration 282: A-3 — restringe RPCs fiscais de worker a service_role
-- Data: 2026-07-29
--
-- PROBLEMA
-- --------
-- Todas as 10 assinaturas `fiscal_*` eram executáveis por `authenticated`.
-- A mais grave: `fiscal_marcar_emitido(uuid,text,text,text,jsonb)` — qualquer
-- operador de caixa autenticado podia marcar um documento fiscal como EMITIDO
-- com chave e protocolo arbitrários, direto via PostgREST, sem passar pelo
-- worker nem por qualquer verificação de perfil.
--
-- MAPEAMENTO DE CHAMADORES (feito antes de revogar qualquer coisa)
-- ----------------------------------------------------------------
-- Worker — backend/supabase/functions/fiscal-worker/index.ts:24 cria o cliente
-- com SUPABASE_SERVICE_ROLE_KEY. Todas as chamadas abaixo são service_role:
--     fiscal_claim_documentos ............ index.ts:55
--     fiscal_marcar_emitido .............. index.ts:80
--     fiscal_marcar_erro ................. index.ts:89 e :119
--     fiscal_marcar_erro_normalizado ..... index.ts:147
--     fiscal_marcar_erro (3 args) ........ e2e/sync-fluxo-gerente.spec.ts:193,
--                                          via cliente `admin` (service_role)
--
-- Aplicação — usa createClient() (sessão do usuário → papel `authenticated`).
-- Estas PRECISAM continuar com authenticated:
--     fiscal_enfileirar_documento_venda .. app/caixa/server/caixaFiscalEnqueueServer.ts:60
--     fiscal_registrar_evento_enqueue_erro app/caixa/server/caixaFiscalEnqueueServer.ts:72
--     fiscal_reprocessar_documento(uuid) . app/gerente/financeiro/actions.ts:146,
--                                          protegida por assertGerenteSession()
--
-- Verificado também que `processarFilaFiscalAgora` (actions.ts:160) NÃO chama
-- fiscal_claim_documentos por RPC — invoca a edge function por HTTP com o
-- header X-FISCAL-WORKER-KEY. Por isso o claim pode sair de `authenticated`
-- sem quebrar o botão "processar fila agora" do painel.
--
-- RELAÇÃO COM O D-1 DO GO_LIVE_BLOCKERS
-- -------------------------------------
-- O overload `fiscal_reprocessar_documento(uuid, text)` é o item D-1: sem
-- verificação de perfil, com GRANT a authenticated e referenciando colunas
-- inexistentes (falha fechada hoje, por erro de parse, mas é escalada latente).
-- Verificado: NENHUM chamador no código usa a versão de 2 argumentos — a única
-- chamada passa apenas p_documento_id, resolvendo para o overload de 1 arg.
-- Revogar `authenticated` dele fecha metade do D-1 sem tocar no corpo. A outra
-- metade (colunas inexistentes / DROP do overload) fica para depois do
-- baseline, junto com a limpeza dos demais overloads legados.
--
-- ESCOPO
-- ------
-- Apenas DDL de permissão. Nenhum corpo de função alterado. Nenhuma função
-- removida. `service_role` preservado em todas. `anon` já estava negado em
-- todas as 10 (nada a fazer).
--
-- ⚠️ O módulo fiscal permanece DESLIGADO até D-1 → D-2 → D-3 → B-6 → B-5.
-- Esta migration não o ativa; apenas reduz a superfície enquanto ele dorme.
--
-- ROLLBACK
-- --------
--   GRANT EXECUTE ON FUNCTION public.<assinatura> TO authenticated;

BEGIN;

-- Greenfield: overloads fiscais adicionados em migrations posteriores (ordem lex numérica)
-- são ignorados aqui; REVOKE/GRANT só quando to_regprocedure encontra a assinatura.

DO $guard_fiscal_worker$
BEGIN
  IF to_regprocedure('public.fiscal_claim_documentos(integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.fiscal_claim_documentos(integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fiscal_claim_documentos(integer) TO service_role;
  END IF;

  IF to_regprocedure('public.fiscal_marcar_emitido(uuid,text,text,text,jsonb)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.fiscal_marcar_emitido(uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fiscal_marcar_emitido(uuid,text,text,text,jsonb) TO service_role;
  END IF;

  IF to_regprocedure('public.fiscal_marcar_erro(uuid,text,boolean)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.fiscal_marcar_erro(uuid,text,boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fiscal_marcar_erro(uuid,text,boolean) TO service_role;
  END IF;

  IF to_regprocedure('public.fiscal_marcar_erro(uuid,text,boolean,text,jsonb,boolean)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.fiscal_marcar_erro(uuid,text,boolean,text,jsonb,boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fiscal_marcar_erro(uuid,text,boolean,text,jsonb,boolean) TO service_role;
  END IF;

  IF to_regprocedure('public.fiscal_marcar_erro_normalizado(uuid,text,boolean,text,jsonb,boolean)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.fiscal_marcar_erro_normalizado(uuid,text,boolean,text,jsonb,boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fiscal_marcar_erro_normalizado(uuid,text,boolean,text,jsonb,boolean) TO service_role;
  END IF;

  IF to_regprocedure('public.fiscal_marcar_erro_normalizado(uuid,text,boolean,text,text,text,boolean,text,jsonb)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.fiscal_marcar_erro_normalizado(uuid,text,boolean,text,text,text,boolean,text,jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fiscal_marcar_erro_normalizado(uuid,text,boolean,text,text,text,boolean,text,jsonb) TO service_role;
  END IF;

  IF to_regprocedure('public.fiscal_reprocessar_documento(uuid,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.fiscal_reprocessar_documento(uuid,text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid,text) TO service_role;
  END IF;
END
$guard_fiscal_worker$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Chamadas pela aplicação → authenticated PRESERVADO (reafirmado)
-- ═══════════════════════════════════════════════════════════════════════════

DO $guard_fiscal_app_grants$
BEGIN
  IF to_regprocedure('public.fiscal_enfileirar_documento_venda(uuid,text,jsonb)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid,text,jsonb) TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.fiscal_registrar_evento_enqueue_erro(uuid,text,text,jsonb)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid,text,text,jsonb) TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.fiscal_reprocessar_documento(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO authenticated, service_role;
  END IF;
END
$guard_fiscal_app_grants$;

NOTIFY pgrst, 'reload schema';

COMMIT;
