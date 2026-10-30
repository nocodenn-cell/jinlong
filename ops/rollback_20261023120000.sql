-- Rollback de 20261023120000_revoga_decrementar_estoque_seguro_authenticated (PR #628).
-- Runbook: docs/runbooks/APLICAR_20261023120000_REVOKE_ESTOQUE.md, seção 5. Uma transação.
-- Devolve EXECUTE a authenticated, restaura o check grant_estoque_seguro do diagnóstico e remove a versão
-- 20261023120000 do ledger (a aplicação por ops/aplicar_20261023120000.sql grava exatamente essa versão).

BEGIN;

GRANT EXECUTE ON FUNCTION public.decrementar_estoque_seguro(uuid, numeric, uuid) TO authenticated;

DO $rb$
DECLARE
  v_def text := pg_get_functiondef('public.pdv_diagnostico_pre_producao(text)'::regprocedure);
BEGIN
  v_def := regexp_replace(v_def,
    $re$v_ok\s*:=\s*NOT\s+has_function_privilege\(\s*'authenticated'\s*,\s*'public\.decrementar_estoque_seguro\(uuid, numeric, uuid\)'\s*,\s*'EXECUTE'\s*\)$re$,
    $r$v_ok := has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE')$r$);
  v_def := replace(v_def, $t$'Estoque seguro sem EXECUTE direto'$t$, $t$'GRANT estoque seguro'$t$);
  v_def := replace(v_def, $d$'authenticated sem EXECUTE direto (só finalizar v4 / sync-outbox).'$d$, $d$'authenticated EXECUTE estoque.'$d$);
  EXECUTE v_def;
END
$rb$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261023120000';

COMMIT;
