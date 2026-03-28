-- Verificação rápida P0 (cole no SQL Editor do Supabase do ambiente que você chama de produção).
-- Esperado: migrations 001…009 aplicadas, RLS em descontos_venda, RPC de estoque, tabela estoque_baixas.

-- 1) Histórico de migrations aplicadas (Supabase hosted; colunas podem variar por versão)
SELECT *
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- 2) Objetos críticos P0
SELECT proname AS rotina
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname = 'decrementar_estoque_idempotente';

SELECT to_regclass('public.estoque_baixas') AS tabela_estoque_baixas;
SELECT to_regclass('public.descontos_venda') AS tabela_descontos_venda;

-- 3) RLS em descontos_venda (rowsecurity = true)
SELECT c.relname, c.relrowsecurity AS rls_ativo
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'descontos_venda';

SELECT polname, cmd
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'descontos_venda'
ORDER BY polname;

-- 4) GRANT na RPC de estoque para authenticated (migration 009 — caixa web)
SELECT has_function_privilege(
  'authenticated',
  'public.decrementar_estoque_idempotente(uuid, numeric, uuid)',
  'EXECUTE'
) AS authenticated_pode_executar_rpc_estoque;
