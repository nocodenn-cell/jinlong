-- =============================================================================
-- Checklist pré-produção PDV / Caixa — FastProduct
-- =============================================================================
-- Execute no SQL Editor do Supabase do ambiente alvo (staging ou produção).
-- Não altera dados. Somente leitura de catálogo, privilégios e migrations.
--
-- Saída 1: checklist (categoria | verificacao | status | detalhe)
-- Saída 2: resumo (total_falhas deve ser 0 antes do primeiro cliente)
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.diag_check(
  p_ordem integer,
  p_categoria text,
  p_verificacao text,
  p_ok boolean,
  p_detalhe text,
  p_aviso boolean DEFAULT false
)
RETURNS TABLE (
  ordem integer,
  categoria text,
  verificacao text,
  status text,
  detalhe text
)
LANGUAGE sql
AS $$
  SELECT
    p_ordem,
    p_categoria,
    p_verificacao,
    CASE WHEN p_ok THEN 'OK' WHEN p_aviso THEN 'AVISO' ELSE 'FALHA' END,
    p_detalhe;
$$;

CREATE OR REPLACE FUNCTION pg_temp.migration_aplicada(p_like text)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations m
    WHERE m.version::text LIKE p_like
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.funcao_existe(p_nome text)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = p_nome
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.tabela_existe(p_nome text)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT to_regclass('public.' || p_nome) IS NOT NULL;
$$;

DROP TABLE IF EXISTS pg_temp.pdv_diag_checks;
CREATE TEMP TABLE pg_temp.pdv_diag_checks AS
SELECT * FROM (
  SELECT * FROM pg_temp.diag_check(10, 'migrations', 'migration_243_v4_finalize',
    pg_temp.migration_aplicada('%243%'), 'RPC finalizar_venda v4 (243 ou sucessor 246).')
  UNION ALL SELECT * FROM pg_temp.diag_check(11, 'migrations', 'migration_127_kardex_estoque',
    pg_temp.migration_aplicada('%127%'), 'Kardex SAIDA_VENDA em movimentos_estoque_log.')
  UNION ALL SELECT * FROM pg_temp.diag_check(12, 'migrations', 'migration_234_calcular_preco',
    pg_temp.migration_aplicada('%234%'), 'RPC calcular_preco_produto.')
  UNION ALL SELECT * FROM pg_temp.diag_check(13, 'migrations', 'migration_228_venda_eventos',
    pg_temp.migration_aplicada('%228%'), 'Ledger venda_eventos.')
  UNION ALL SELECT * FROM pg_temp.diag_check(14, 'migrations', 'migration_058_caixa_web',
    pg_temp.migration_aplicada('%058%'), 'RPC obter_status_caixa_operador.')
  UNION ALL SELECT * FROM pg_temp.diag_check(15, 'migrations', 'migration_255_grant_baseline',
    pg_temp.migration_aplicada('%255%grant%') OR pg_temp.migration_aplicada('%255_grant%'),
    'GRANT baseline authenticated (recomendado).',
    NOT (pg_temp.migration_aplicada('%255%grant%') OR pg_temp.migration_aplicada('%255_grant%')))

  UNION ALL SELECT * FROM pg_temp.diag_check(20, 'rpc', 'finalizar_venda_v4_existe',
    pg_temp.funcao_existe('finalizar_venda_transacional_canonica_v4'),
    'Função canônica de finalização (caixa web).')
  UNION ALL SELECT * FROM pg_temp.diag_check(21, 'rpc', 'decrementar_estoque_seguro_existe',
    pg_temp.funcao_existe('decrementar_estoque_seguro'), 'Baixa atômica de estoque.')
  UNION ALL SELECT * FROM pg_temp.diag_check(22, 'rpc', 'calcular_preco_produto_existe',
    pg_temp.funcao_existe('calcular_preco_produto'), 'Preço autoritativo varejo/atacado.')
  UNION ALL SELECT * FROM pg_temp.diag_check(23, 'rpc', 'obter_status_caixa_operador_existe',
    pg_temp.funcao_existe('obter_status_caixa_operador'), 'Status do turno de caixa.')
  UNION ALL SELECT * FROM pg_temp.diag_check(24, 'rpc', 'configuracoes_para_caixa_web_existe',
    pg_temp.funcao_existe('configuracoes_para_caixa_web'), 'Config exposta ao PDV.')
  UNION ALL SELECT * FROM pg_temp.diag_check(25, 'rpc', 'ensure_venda_evento_registrado_existe',
    pg_temp.funcao_existe('ensure_venda_evento_registrado'), 'Ledger pós-venda.')

  UNION ALL SELECT * FROM pg_temp.diag_check(30, 'grants', 'grant_finalizar_venda_v4_authenticated',
    has_function_privilege('authenticated',
      'public.finalizar_venda_transacional_canonica_v4(uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text)',
      'EXECUTE'),
    'EXECUTE finalizar_venda v4 → authenticated.')
  UNION ALL SELECT * FROM pg_temp.diag_check(31, 'grants', 'grant_decrementar_estoque_seguro_authenticated',
    has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE'),
    'EXECUTE decrementar_estoque_seguro → authenticated.')
  UNION ALL SELECT * FROM pg_temp.diag_check(32, 'grants', 'grant_calcular_preco_authenticated',
    has_function_privilege('authenticated', 'public.calcular_preco_produto(uuid, integer, uuid)', 'EXECUTE'),
    'EXECUTE calcular_preco_produto → authenticated.')
  UNION ALL SELECT * FROM pg_temp.diag_check(33, 'grants', 'grant_obter_status_caixa_authenticated',
    has_function_privilege('authenticated', 'public.obter_status_caixa_operador(uuid)', 'EXECUTE'),
    'EXECUTE obter_status_caixa_operador → authenticated.')
  UNION ALL SELECT * FROM pg_temp.diag_check(34, 'grants', 'grant_sync_venda_negado_authenticated',
    NOT has_function_privilege('authenticated',
      'public.registrar_venda_com_itens(uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, text)',
      'EXECUTE'),
    'authenticated NÃO executa registrar_venda_com_itens (sync only).')

  UNION ALL SELECT * FROM pg_temp.diag_check(40, 'tabelas', 'tabela_vendas',
    pg_temp.tabela_existe('vendas'), 'Cabeçalho de venda.')
  UNION ALL SELECT * FROM pg_temp.diag_check(41, 'tabelas', 'tabela_itens_venda',
    pg_temp.tabela_existe('itens_venda'), 'Itens da venda.')
  UNION ALL SELECT * FROM pg_temp.diag_check(42, 'tabelas', 'tabela_vendas_pagamentos',
    pg_temp.tabela_existe('vendas_pagamentos'), 'Pagamentos.')
  UNION ALL SELECT * FROM pg_temp.diag_check(43, 'tabelas', 'tabela_estoque',
    pg_temp.tabela_existe('estoque'), 'Saldo por loja.')
  UNION ALL SELECT * FROM pg_temp.diag_check(44, 'tabelas', 'tabela_caixas',
    pg_temp.tabela_existe('caixas'), 'Turnos de caixa.')
  UNION ALL SELECT * FROM pg_temp.diag_check(45, 'tabelas', 'tabela_venda_eventos',
    pg_temp.tabela_existe('venda_eventos'), 'Ledger imutável.')
  UNION ALL SELECT * FROM pg_temp.diag_check(46, 'tabelas', 'tabela_estoque_baixas',
    pg_temp.tabela_existe('estoque_baixas'), 'Idempotência de baixa.')

  UNION ALL SELECT * FROM pg_temp.diag_check(50, 'rls', 'rls_vendas',
    COALESCE((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'vendas'), false), 'RLS em vendas.')
  UNION ALL SELECT * FROM pg_temp.diag_check(51, 'rls', 'rls_caixas',
    COALESCE((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'caixas'), false), 'RLS em caixas.')
  UNION ALL SELECT * FROM pg_temp.diag_check(52, 'rls', 'rls_estoque',
    COALESCE((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'estoque'), false), 'RLS em estoque.')

  UNION ALL SELECT * FROM pg_temp.diag_check(60, 'config_db', 'vendas_suspensas_desligadas',
    NOT COALESCE((
      SELECT lower(btrim(c.valor)) IN ('true', '1', 'yes', 'on')
      FROM public.configuracoes_gerais c WHERE c.chave = 'vendas_suspensas' LIMIT 1
    ), false),
    'vendas_suspensas=false (senão operador não finaliza vendas).')

  UNION ALL SELECT * FROM pg_temp.diag_check(70, 'estoque_teste', 'produto_demo_existe',
    EXISTS (SELECT 1 FROM public.produtos p
      WHERE p.codigo_barras = '7898512340003' OR p.codigo_interno = '7898512340003' LIMIT 1),
    'Produto demo 7898512340003 (seed 027) ou defina PDV_DIAGNOSTICO_PRODUTO_CODIGO.',
    NOT EXISTS (SELECT 1 FROM public.produtos p
      WHERE p.codigo_barras = '7898512340003' OR p.codigo_interno = '7898512340003' LIMIT 1))
  UNION ALL SELECT * FROM pg_temp.diag_check(71, 'estoque_teste', 'produto_demo_saldo_positivo',
    EXISTS (SELECT 1 FROM public.produtos p JOIN public.estoque e ON e.produto_id = p.id
      WHERE (p.codigo_barras = '7898512340003' OR p.codigo_interno = '7898512340003')
        AND e.quantidade_atual > 0 LIMIT 1),
    'Saldo > 0 para produto demo em estoque.',
    NOT EXISTS (SELECT 1 FROM public.produtos p JOIN public.estoque e ON e.produto_id = p.id
      WHERE (p.codigo_barras = '7898512340003' OR p.codigo_interno = '7898512340003')
        AND e.quantidade_atual > 0 LIMIT 1))
) all_checks;

-- 1) Checklist detalhado
SELECT categoria, verificacao, status, detalhe
FROM pg_temp.pdv_diag_checks
ORDER BY ordem;

-- 2) Resumo
SELECT
  COUNT(*) FILTER (WHERE status = 'FALHA') AS total_falhas,
  COUNT(*) FILTER (WHERE status = 'AVISO') AS total_avisos,
  COUNT(*) FILTER (WHERE status = 'OK') AS total_ok,
  CASE WHEN COUNT(*) FILTER (WHERE status = 'FALHA') = 0
    THEN 'PRONTO_PILOTO' ELSE 'BLOQUEADO' END AS veredito
FROM pg_temp.pdv_diag_checks;
