-- SEC-06 — remove a superfície pública da transferência legada.
--
-- `transferir_estoque_entre_lojas(uuid,uuid,uuid,numeric,text)` é SECURITY
-- DEFINER, move estoque entre lojas e segue com EXECUTE para `authenticated`
-- (e service_role). Não tem consumidor: o app usa exclusivamente
-- `transferir_estoque_seguro` (app/gerente/transferencias/actions.ts), que
-- além da mesma guarda de tenant (20260828140000) tem idempotência, lock
-- determinístico e checagem de saldo esperado. Referências restantes eram só
-- `database.types.ts` (gerado), documentação e 3 regras de test:rls-scope —
-- migradas nesta mesma mudança para a função canônica.
--
-- A remoção da função foi deliberadamente adiada em 20260819230000 apenas por
-- causa dessas 3 regras de teste. Aqui a correção mínima é REVOKE, não DROP:
-- fecha a RPC para qualquer caller da API sem mexer em tipos gerados nem
-- apagar histórico. DROP fica como limpeza posterior, se desejado.
--
-- Regra de negócio de transferência NÃO muda (GERENTE participa pela origem
-- ou destino; DONO/ADMIN globais — Padrão A).

BEGIN;

DO $revoke$
BEGIN
  IF to_regprocedure('public.transferir_estoque_entre_lojas(uuid,uuid,uuid,numeric,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.transferir_estoque_entre_lojas(uuid, uuid, uuid, numeric, text)
      FROM PUBLIC, anon, authenticated, service_role;

    COMMENT ON FUNCTION public.transferir_estoque_entre_lojas(uuid, uuid, uuid, numeric, text) IS
      'LEGADO sem consumidor — EXECUTE revogado de PUBLIC/anon/authenticated/service_role (SEC-06, 20260916120200). Caminho canônico: transferir_estoque_seguro.';
  END IF;
END
$revoke$;

DO $verify$
DECLARE
  v_legado regprocedure := to_regprocedure('public.transferir_estoque_entre_lojas(uuid,uuid,uuid,numeric,text)');
  v_canonica regprocedure := 'public.transferir_estoque_seguro(uuid,uuid,uuid,numeric,text,text,numeric)'::regprocedure;
BEGIN
  IF v_legado IS NOT NULL AND (
       has_function_privilege('authenticated', v_legado, 'EXECUTE')
    OR has_function_privilege('anon', v_legado, 'EXECUTE')
    OR has_function_privilege('service_role', v_legado, 'EXECUTE')) THEN
    RAISE EXCEPTION 'SEC06_LEGADO_AINDA_EXECUTAVEL';
  END IF;

  -- A canônica precisa continuar disponível ao app e com a guarda de tenant.
  IF NOT has_function_privilege('authenticated', v_canonica, 'EXECUTE') THEN
    RAISE EXCEPTION 'SEC06_CANONICA_SEM_GRANT';
  END IF;
  IF has_function_privilege('anon', v_canonica, 'EXECUTE') THEN
    RAISE EXCEPTION 'SEC06_CANONICA_EXPOSTA_ANON';
  END IF;
  IF position('TRANSFERENCIA_LOJA_INVALIDA' IN pg_get_functiondef(v_canonica)) = 0 THEN
    RAISE EXCEPTION 'SEC06_CANONICA_SEM_GUARDA_TENANT';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
