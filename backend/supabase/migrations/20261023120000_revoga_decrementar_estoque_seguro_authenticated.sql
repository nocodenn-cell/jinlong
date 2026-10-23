-- Advisor de segurança — revoga EXECUTE de `authenticated` em `public.decrementar_estoque_seguro(uuid, numeric, uuid)`.
--
-- Complementa 20261016120100_hardening_rls_search_path_residual (#577), que já fechou os outros achados de baixo
-- risco do advisor (RLS em sync_request_nonces/venda_engine_shadow_runs e search_path das 8 funções).
--
-- PROBLEMA (produção kbabmewnahysfvlybiak, verificado em 2026-10-23): a função é SECURITY DEFINER e só confere
-- `vendas.operador_id = auth.uid()`. Um OPERADOR conseguia chamá-la direto via `/rest/v1/rpc` com QUALQUER
-- `p_quantidade`, para qualquer produto, sobre uma venda própria — baixa de estoque fora do fluxo de venda.
--
-- Consumidores legítimos não dependem do grant de `authenticated`:
--   - `finalizar_venda_transacional_canonica_v4_unscoped`, `finalizar_venda_transacional` (9 args) e
--     `pdv_diagnostico_pre_producao` — SECURITY DEFINER, dono `postgres`;
--   - Edge Function `sync-outbox` — client `service_role`.
-- Nenhum código do app (pdv-importados, shared-core, pdv-local) chama a RPC com JWT de usuário.
--
-- Regressão: backend/scripts/advisor-seguranca-onda1.test.sql
--
-- ROLLBACK (idempotente):
--   GRANT EXECUTE ON FUNCTION public.decrementar_estoque_seguro(uuid, numeric, uuid) TO authenticated;

DO $revoke$
BEGIN
  IF to_regprocedure('public.decrementar_estoque_seguro(uuid, numeric, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.decrementar_estoque_seguro(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.decrementar_estoque_seguro(uuid, numeric, uuid) TO service_role;
  END IF;
END
$revoke$;

NOTIFY pgrst, 'reload schema';
