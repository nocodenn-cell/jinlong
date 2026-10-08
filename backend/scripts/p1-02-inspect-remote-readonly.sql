-- P1-02 — inspeção SOMENTE LEITURA (pré/pós lote).
-- NÃO executar DDL. NÃO ALTERAR schema_migrations.
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/p1-02-inspect-remote-readonly.sql

\echo '=== schema_migrations tip P1-02 ==='
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version LIKE '20261007%'
   OR version LIKE '20261008%'
   OR version IN ('20261006120000', '20261006180000', '20261006195837')
ORDER BY version;

\echo '=== objetos alvo ==='
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'formas_pagamento'
      AND column_name = 'conta_financeira_id'
  ) AS formas_pagamento_conta_financeira_id,
  to_regclass('public.financeiro_contas_forma') IS NOT NULL AS financeiro_contas_forma,
  to_regclass('public.caixas_fechamento_formas') IS NOT NULL AS caixas_fechamento_formas,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fiscal_marcar_cancelado'
  ) AS has_fiscal_marcar_cancelado,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'calcular_valor_sistema_por_forma_caixa'
  ) AS has_calc_forma,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'financeiro_comando'
  ) AS has_financeiro_comando,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'financeiro_comando_v1'
  ) AS has_financeiro_comando_v1,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'financeiro_comando_operacional'
  ) AS has_financeiro_comando_operacional,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'internal' AND p.proname = 'financeiro_conta_forma'
  ) AS has_conta_forma_helper,
  has_table_privilege('authenticated', 'public.documentos_fiscais_pendentes', 'INSERT')
    AS auth_insert_docs;

\echo '=== captura canônica (corpo) ==='
SELECT
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'internal'
      AND p.proname = 'financeiro_capturar_venda'
      AND strpos(lower(pg_get_functiondef(p.oid)), 'financeiro_conta_forma') > 0
  ) AS capturar_uses_conta_forma,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'internal'
      AND p.proname = 'financeiro_capturar_venda'
      AND strpos(lower(pg_get_functiondef(p.oid)), 'pix automática') > 0
  ) AS capturar_has_auto_pix;

\echo '=== grants / DEFINER snapshot ==='
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS srv_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'financeiro_comando',
    'financeiro_comando_v1',
    'financeiro_comando_operacional',
    'calcular_valor_sistema_por_forma_caixa',
    'fiscal_marcar_cancelado',
    'fechar_caixa_atomico',
    'cancelar_venda_transacional',
    'listar_caixas_fechamento_formas'
  )
ORDER BY 1, 2;

\echo '=== overload financeiro_comando* ==='
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  oidvectortypes(p.proargtypes) AS argtypes
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'financeiro_comando%'
ORDER BY 1, 2;
