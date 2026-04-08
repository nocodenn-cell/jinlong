-- Verificação rápida P0 (cole no SQL Editor do Supabase do ambiente que você chama de produção).
-- Esperado: migrations 001…010 (P0) + 011–013 (relatórios) + 014–015 (RPCs/sync) + 016–017 (estoque atômico + auth),
-- RLS descontos_venda + estoque_baixas, RPCs de estoque, tabela estoque_baixas,
-- RPCs relatorio_*_periodo (date + p_tz após 013), anti-replay 024 e RPC canônica 025.

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

-- 6) Hardening migration 015 — privilégios das RPCs críticas
-- Esperado: authenticated NÃO executa registrar_venda_com_itens; service_role SIM.
-- decrementar_estoque_idempotente: authenticated e service_role executam.

-- Conferir manualmente: registrar_venda_com_itens só para service_role (authenticated = false, service_role = true).
SELECT has_function_privilege(
  'authenticated',
  'public.registrar_venda_com_itens(uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, text)',
  'EXECUTE'
) AS registrar_venda__authenticated_execute;

SELECT has_function_privilege(
  'service_role',
  'public.registrar_venda_com_itens(uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, text)',
  'EXECUTE'
) AS registrar_venda__service_role_execute;

-- Ambos true após 015 (caixa web + Edge).
SELECT has_function_privilege(
  'authenticated',
  'public.decrementar_estoque_idempotente(uuid, numeric, uuid)',
  'EXECUTE'
) AS decrementar_estoque__authenticated_execute;

SELECT has_function_privilege(
  'service_role',
  'public.decrementar_estoque_idempotente(uuid, numeric, uuid)',
  'EXECUTE'
) AS decrementar_estoque__service_role_execute;

-- 7) Verificação migration 016 — RPC decrementar_estoque_seguro (com controle de concorrência)
-- Esta RPC deve existir e ter permissões para authenticated e service_role

SELECT proname AS rotina
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname = 'decrementar_estoque_seguro';

-- Verifica privilégios da nova RPC segura
SELECT has_function_privilege(
  'authenticated',
  'public.decrementar_estoque_seguro(uuid, numeric, uuid)',
  'EXECUTE'
) AS decrementar_estoque_seguro__authenticated_execute;

SELECT has_function_privilege(
  'service_role',
  'public.decrementar_estoque_seguro(uuid, numeric, uuid)',
  'EXECUTE'
) AS decrementar_estoque_seguro__service_role_execute;

-- Verifica coluna version na tabela estoque (controle de concorrência otimista)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'estoque'
  AND column_name = 'version';

-- Verifica índice único em estoque_baixas
SELECT indexname
FROM pg_indexes
WHERE tablename = 'estoque_baixas'
  AND indexname = 'estoque_baixas_venda_produto_unique';

-- 8) Função validar-gerente + tabela de auditoria de tokens (migration 018)
SELECT to_regclass('public.tokens_desconto_gerente') AS tabela_tokens_desconto_gerente;

-- 9) Rate-limit por escopo em validar-gerente (migration 022)
SELECT to_regclass('public.gerente_auth_rate_limits') AS tabela_gerente_auth_rate_limits;

SELECT has_table_privilege('service_role', 'public.gerente_auth_rate_limits', 'SELECT') AS rl_service_role_select;
SELECT has_table_privilege('service_role', 'public.gerente_auth_rate_limits', 'INSERT') AS rl_service_role_insert;
SELECT has_table_privilege('service_role', 'public.gerente_auth_rate_limits', 'UPDATE') AS rl_service_role_update;

-- 10) Finalização transacional com token de gerente (migration 023)
SELECT has_function_privilege(
  'authenticated',
  'public.finalizar_venda_transacional(uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric)',
  'EXECUTE'
) AS finalizar_venda_tx_token__authenticated_execute;

-- 11) Anti-replay sync-outbox (migration 024)
SELECT to_regclass('public.sync_request_nonces') AS tabela_sync_request_nonces;

SELECT c.relname, c.relrowsecurity AS rls_ativo
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'sync_request_nonces';

SELECT has_table_privilege('service_role', 'public.sync_request_nonces', 'SELECT') AS nonce_service_role_select;
SELECT has_table_privilege('service_role', 'public.sync_request_nonces', 'INSERT') AS nonce_service_role_insert;
SELECT has_table_privilege('service_role', 'public.sync_request_nonces', 'DELETE') AS nonce_service_role_delete;
SELECT has_table_privilege('authenticated', 'public.sync_request_nonces', 'SELECT') AS nonce_authenticated_select;
SELECT has_table_privilege('authenticated', 'public.sync_request_nonces', 'INSERT') AS nonce_authenticated_insert;
SELECT has_table_privilege('authenticated', 'public.sync_request_nonces', 'DELETE') AS nonce_authenticated_delete;

-- 12) RPC canônica v2 (migration 025)
SELECT has_function_privilege(
  'authenticated',
  'public.finalizar_venda_transacional_canonica_v2(uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric, boolean)',
  'EXECUTE'
) AS finalizar_venda_canonica_v2__authenticated_execute;

SELECT has_function_privilege(
  'service_role',
  'public.finalizar_venda_transacional_canonica_v2(uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric, boolean)',
  'EXECUTE'
) AS finalizar_venda_canonica_v2__service_role_execute;
