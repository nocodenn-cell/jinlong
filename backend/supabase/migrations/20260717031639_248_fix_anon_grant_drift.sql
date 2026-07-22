-- Supabase schema-level default privileges re-grant EXECUTE to anon on function
-- creation, overriding the REVOKE ALL FROM PUBLIC in 248 (anon is a direct grantee,
-- not reached by revoking from the PUBLIC pseudo-role). The migration's own intent
-- was unambiguous: only authenticated/service_role should call this RPC.
-- Same drift pattern already documented for finalizar_venda_transacional_canonica_v4
-- in P0_DB_DRIFT_RECONCILIATION.md §8.0 — this is a new instance on a function that
-- didn't exist until this migration.
REVOKE EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid
) FROM anon;
