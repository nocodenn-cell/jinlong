-- Aplicação manual de 20261028120000_revoga_helpers_tenant_authenticated (auditoria SECDEF, f3f75434).
-- Runbook: docs/runbooks/APLICAR_20261028120000_REVOKE_HELPERS_TENANT.md
--
-- Colar inteiro no SQL Editor do Supabase (ou `psql -v ON_ERROR_STOP=1 -f ops/aplicar_20261028120000.sql`).
-- Uma transação: recusa se a versão já existir; executa o conteúdo EXATO do arquivo da migration; grava
-- schema_migrations com a versão real 20261028120000 e o SQL aplicado em `statements`.
-- GERADO a partir do arquivo da migration — não editar à mão; regenerar se a migration mudar.

BEGIN;

DO $aplicar$
DECLARE
  v_sql text := $mig$-- Revoga EXECUTE de `authenticated` nos helpers que revelam dados de outra empresa/loja.
--
-- PROBLEMA (comprovado na auditoria INT-01 / RPC-SECDEF, 2026-10-28): estes helpers são SECURITY DEFINER e
-- não conferem se o chamador pertence à empresa informada. Um usuário autenticado da empresa A, passando o
-- UUID de uma loja da empresa B, recebia:
--   - fp_empresa_da_loja(lojaB)   -> id da empresa B
--   - fp_empresa_operacional(eB)  -> se a empresa B está ATIVA e em vigência
--   - fp_pdv_config_id(lojaB)     -> id da configuração de PDV da loja B
--   - fp_mesma_empresa(lojaB, lojaB) -> booleano de pertencimento (exposto como enumeração)
--
-- Consumidores legítimos não dependem do grant de `authenticated`:
--   - todos os chamadores no banco são funções SECURITY DEFINER (executam como dono, que mantém EXECUTE);
--   - não há view nem policy de RLS que os chame;
--   - nenhum código do app (pdv-importados, pdv-local, shared-core, hub, site) chama essas RPCs.
-- Os corpos das funções não mudam: só o privilégio de execução.
--
-- Regressão: backend/scripts/ (suítes multiempresa e comissao) e a matriz de acesso cruzado da auditoria.
--
-- ROLLBACK (idempotente):
--   GRANT EXECUTE ON FUNCTION public.fp_empresa_da_loja(uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.fp_empresa_operacional(uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.fp_pdv_config_id(uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.fp_mesma_empresa(uuid, uuid) TO authenticated;

DO $revoke$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.fp_empresa_da_loja(uuid)',
    'public.fp_empresa_operacional(uuid)',
    'public.fp_pdv_config_id(uuid)',
    'public.fp_mesma_empresa(uuid, uuid)'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END
$revoke$;
$mig$;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261028120000') THEN
    RAISE EXCEPTION '20261028120000 já consta em schema_migrations — nada a fazer';
  END IF;
  EXECUTE v_sql;
  INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
  VALUES ('20261028120000', 'revoga_helpers_tenant_authenticated', ARRAY[v_sql]);
END
$aplicar$;

NOTIFY pgrst, 'reload schema';

COMMIT;
