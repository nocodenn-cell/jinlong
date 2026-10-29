-- Rollback de 20261028120000_revoga_helpers_tenant_authenticated (auditoria SECDEF, f3f75434).
-- Runbook: docs/runbooks/APLICAR_20261028120000_REVOKE_HELPERS_TENANT.md, seção 5. Uma transação.
-- Devolve EXECUTE a authenticated nos 4 helpers (ACL de produção antes da aplicação, conferida em 2026-10-28:
-- {postgres=X, service_role=X, authenticated=X}; sem PUBLIC nem anon) e remove a versão 20261028120000 do
-- ledger (a aplicação por ops/aplicar_20261028120000.sql grava exatamente essa versão).

BEGIN;

GRANT EXECUTE ON FUNCTION public.fp_empresa_da_loja(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_empresa_operacional(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_pdv_config_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_mesma_empresa(uuid, uuid) TO authenticated;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261028120000';

NOTIFY pgrst, 'reload schema';

COMMIT;
