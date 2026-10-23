-- Aplicação manual de 20261023120000_revoga_decrementar_estoque_seguro_authenticated (PR #628).
-- Runbook: docs/runbooks/APLICAR_20261023120000_REVOKE_ESTOQUE.md
--
-- Colar inteiro no SQL Editor do Supabase (ou `psql -v ON_ERROR_STOP=1 -f ops/aplicar_20261023120000.sql`).
-- Uma transação: recusa se a versão já existir; executa o conteúdo EXATO do arquivo da migration; grava
-- schema_migrations com a versão real 20261023120000 e o SQL aplicado em `statements`.
-- GERADO a partir do arquivo da migration — não editar à mão; regenerar se a migration mudar.

BEGIN;

DO $aplicar$
DECLARE
  v_sql text := $mig$
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
-- O diagnóstico ao vivo `pdv_diagnostico_pre_producao` (/admin/diagnostico-caixa) exigia esse grant no check
-- `grant_estoque_seguro`: sem ajuste, todo DONO/ADMIN veria `falha` e veredito BLOQUEADO justamente com a postura
-- correta. O check passa a exigir a NEGAÇÃO. A função é reescrita a partir da definição em vigor (pg_get_functiondef),
-- trocando só esse trecho: produção tem corpo diferente do git (reescritas multiempresa, formatação em uma linha),
-- então um CREATE OR REPLACE completo regrediria o drift. O casamento tolera espaços/quebras de linha.
--
-- Regressão: backend/scripts/advisor-seguranca-onda1.test.sql
--
-- ROLLBACK (idempotente):
--   GRANT EXECUTE ON FUNCTION public.decrementar_estoque_seguro(uuid, numeric, uuid) TO authenticated;
--   e reverter o check: trocar `v_ok := NOT has_function_privilege(...decrementar_estoque_seguro...)` por
--   `v_ok := has_function_privilege(...)` em pdv_diagnostico_pre_producao(text).

DO $revoke$
BEGIN
  IF to_regprocedure('public.decrementar_estoque_seguro(uuid, numeric, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.decrementar_estoque_seguro(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.decrementar_estoque_seguro(uuid, numeric, uuid) TO service_role;
  END IF;
END
$revoke$;

DO $diag$
DECLARE
  v_oid oid := to_regprocedure('public.pdv_diagnostico_pre_producao(text)');
  v_def text;
  v_nova text;
  -- `v_ok := has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE')`
  c_check constant text :=
    $re$v_ok\s*:=\s*has_function_privilege\(\s*'authenticated'\s*,\s*'public\.decrementar_estoque_seguro\(uuid, numeric, uuid\)'\s*,\s*'EXECUTE'\s*\)$re$;
BEGIN
  IF v_oid IS NULL THEN
    RAISE NOTICE 'pdv_diagnostico_pre_producao ausente — nada a ajustar';
    RETURN;
  END IF;

  v_def := pg_get_functiondef(v_oid);
  IF v_def ~ 'v_ok\s*:=\s*NOT\s+has_function_privilege\(\s*''authenticated''\s*,\s*''public\.decrementar_estoque_seguro' THEN
    RETURN;  -- já ajustada (reaplicação)
  END IF;
  IF v_def !~ c_check THEN
    RAISE EXCEPTION 'pdv_diagnostico_pre_producao: check grant_estoque_seguro não encontrado — drift, ajuste manual necessário';
  END IF;

  v_nova := regexp_replace(v_def, c_check,
    $r$v_ok := NOT has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE')$r$);
  v_nova := replace(v_nova, $t$'GRANT estoque seguro'$t$, $t$'Estoque seguro sem EXECUTE direto'$t$);
  v_nova := regexp_replace(v_nova,
    $d$'authenticated (pode executar decrementar_estoque_seguro|EXECUTE estoque)\.'$d$,
    $d$'authenticated sem EXECUTE direto (só finalizar v4 / sync-outbox).'$d$);
  EXECUTE v_nova;
END
$diag$;

NOTIFY pgrst, 'reload schema';
$mig$;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261023120000') THEN
    RAISE EXCEPTION '20261023120000 já consta em schema_migrations — nada a fazer';
  END IF;
  EXECUTE v_sql;
  INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
  VALUES ('20261023120000', 'revoga_decrementar_estoque_seguro_authenticated', ARRAY[v_sql]);
END
$aplicar$;

COMMIT;
