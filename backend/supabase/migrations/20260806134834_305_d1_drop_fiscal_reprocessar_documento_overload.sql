-- Migration 305: D-1 — remove o overload quebrado fiscal_reprocessar_documento(uuid,text)
-- Data: 2026-08-06
-- Referência: docs/GO_LIVE_BLOCKERS.md §3 (D-1) · docs/PLANO_REMEDIACAO_CICD.md (P0-4)
-- Ordem obrigatória do fiscal: D-1 → D-2 → D-3 → B-6 → B-5. Esta é a primeira.
--
-- PROBLEMA (confirmado no banco vivo em 2026-08-06, via pg_get_functiondef)
-- -----------------------------------------------------------------------
-- Existem dois `fiscal_reprocessar_documento`:
--
--   (a) (uuid)        → correta. Verifica perfil (GERENTE/DONO/ADMIN), trava a
--                        linha com FOR UPDATE, só aceita status ERRO/PENDENTE e
--                        grava evento em documentos_fiscais_eventos com o
--                        contrato real de colunas.
--   (b) (uuid, text)  → quebrada e SEM verificação de perfil nenhuma.
--
-- O corpo de (b) referencia colunas que não existem em
-- `documentos_fiscais_pendentes`:
--     correlation_id, erro_normalizado, erro_detalhe
-- e escreve em `documentos_fiscais_eventos` com colunas que também não existem:
--     evento_dados, correlation_id
-- (colunas reais: documento_id, evento_tipo, status_antes, status_depois,
--  actor_user_id, actor_role, origem_acao, payload, created_at).
--
-- Hoje ela falha fechada (erro de parse em tempo de execução) e a migration 282
-- já revogou seu `GRANT EXECUTE` de `authenticated` — restou apenas
-- `service_role`. O risco remanescente é de escalada latente: qualquer correção
-- futura de schema que passe a satisfazer o parse reabre um caminho de
-- reprocesso sem authz, e a coexistência dos dois overloads mantém ambiguidade
-- de resolução no PostgREST.
--
-- MAPEAMENTO DE CHAMADORES (feito antes do DROP)
-- ----------------------------------------------
-- Nenhum chamador usa a versão de 2 argumentos. Todos passam somente
-- `p_documento_id`, resolvendo para o overload de 1 argumento:
--     pdv-importados/app/gerente/financeiro/actions.ts:146  (reprocessarDocumentoFiscal)
--     backend/scripts/test-rls-scope.mjs:637                (smoke de RLS)
--     backend/supabase/scripts/smoke_fiscal_emissao_real.sql:87
-- O worker (backend/supabase/functions/fiscal-worker/index.ts) não chama esta RPC.
--
-- ESCOPO
-- ------
-- Apenas o DROP do overload morto. O overload de 1 argumento — único usado e
-- único com verificação de perfil — não é tocado. Nenhuma tabela, trigger,
-- policy ou GRANT alterado.
--
-- ROLLBACK
-- --------
-- Não há rollback desejável: restaurar o corpo quebrado reintroduz o achado.
-- Se por algum motivo for necessário, o corpo original está preservado no
-- histórico deste arquivo e em docs/PLANO_REMEDIACAO_CICD.md §"Dois overloads".

BEGIN;

DROP FUNCTION IF EXISTS public.fiscal_reprocessar_documento(uuid, text);

-- ═══════════════════════════════════════════════════════════════════════════
-- Verificação no efeito
-- ═══════════════════════════════════════════════════════════════════════════
DO $verify$
DECLARE
  v_overloads integer;
  v_def text;
BEGIN
  SELECT count(*) INTO v_overloads
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fiscal_reprocessar_documento';

  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'MIG305_OVERLOAD_RESIDUAL: esperado 1 assinatura, encontrado %', v_overloads;
  END IF;

  -- A que sobrou precisa ser a que verifica perfil.
  v_def := pg_get_functiondef('public.fiscal_reprocessar_documento(uuid)'::regprocedure);

  IF position('FISCAL_REPROCESSO_PERFIL' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG305_SEM_VERIFICACAO_DE_PERFIL: overload sobrevivente não checa perfil';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fiscal_reprocessar_documento(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG305_GRANT_PERDIDO: authenticated deixou de poder reprocessar (regressão do painel)';
  END IF;

  RAISE NOTICE '305 OK — D-1 fechado: overload sem authz removido, 1 assinatura restante com verificação de perfil';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
