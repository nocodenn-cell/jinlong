-- Verificação rápida P0 (cole no SQL Editor do Supabase do ambiente que você chama de produção).
-- Esperado: migrations 001…010 (P0) + 011–013 (relatórios, dia civil, p_tz + relatorio_settings), RLS descontos_venda + estoque_baixas,
-- RPC de estoque, tabela estoque_baixas, RPCs relatorio_*_periodo (date + p_tz após 013).

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

SELECT polname, pol.polcmd AS cmd
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'descontos_venda'
ORDER BY polname;

-- 3b) RLS em estoque_baixas + policy de leitura gerente (migration 010)
SELECT c.relname, c.relrowsecurity AS rls_ativo
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'estoque_baixas';

SELECT polname, pol.polcmd AS cmd
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'estoque_baixas'
ORDER BY polname;

-- 4) GRANT na RPC de estoque para authenticated (migration 009 — caixa web)
SELECT has_function_privilege(
  'authenticated',
  'public.decrementar_estoque_idempotente(uuid, numeric, uuid)',
  'EXECUTE'
) AS authenticated_pode_executar_rpc_estoque;

-- 5) Relatórios por período (migrations 011–013; 013 = p_tz + relatorio_settings)
SELECT to_regclass('public.relatorio_settings') AS tabela_relatorio_settings;

SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'relatorio_tz_validado',
    'relatorio_vendas_por_dia_periodo',
    'relatorio_top_produtos_periodo'
  )
ORDER BY proname;

SELECT has_function_privilege(
  'authenticated',
  'public.relatorio_vendas_por_dia_periodo(date, date, text)',
  'EXECUTE'
) AS authenticated_relatorio_vendas_dia;

SELECT has_function_privilege(
  'authenticated',
  'public.relatorio_top_produtos_periodo(date, date, integer, text)',
  'EXECUTE'
) AS authenticated_relatorio_top_produtos;
