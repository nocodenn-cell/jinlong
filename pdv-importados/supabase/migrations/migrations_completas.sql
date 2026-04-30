-- Migration Master: Todas as Migrations Críticas em Ordem Correta
-- Execute este arquivo para aplicar TODAS as melhorias de uma vez

-- Ordem de execução recomendada:
-- 1. Feature Flags (base para controle)
-- 2. Performance (índices)
-- 3. RLS (segurança)
-- 4. RPC (idempotência)

-- IMPORTANTE: Execute em ambiente de produção com backup completo

-- 1. Feature Flags (base)
\i supabase/migrations/073_feature_flags.sql

-- 2. Performance (índices controlados por flag)
\i supabase/migrations/performance_indices.sql

-- 3. RLS (segurança controlada por flag)
\i supabase/migrations/rls_policies.sql

-- 4. RPC com idempotência fortalecida
\i supabase/migrations/finalizar_venda_unificada.sql

-- Validação final do sistema
SELECT 
    'Migrations Completas' as status,
    NOW() as data_execucao,
    (
        SELECT COUNT(*) 
        FROM feature_flags 
        WHERE ativo = true
    ) as flags_ativas,
    (
        SELECT COUNT(*) 
        FROM pg_indexes 
        WHERE indexname LIKE 'idx_%'
    ) as indices_criados,
    (
        SELECT COUNT(*) 
        FROM pg_tables 
        WHERE tablename IN ('vendas', 'estoque', 'produtos', 'caixas')
        AND rowsecurity = true
    ) as tabelas_com_rls;

-- Verificar se RPC está atualizada
SELECT 
    'finalizar_venda_transacional_canonica_v3' as nome_rpc,
    EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'finalizar_venda_transacional_canonica_v3'
    ) as rpc_existe;

-- Status final esperado:
-- ✅ Feature flags: 8 flags criadas
-- ✅ Índices: 8+ índices criados  
-- ✅ RLS: 8 tabelas protegidas
-- ✅ RPC: Com idempotência fortalecida

-- Comandos para ativar funcionalidades:
/*
-- Ativar RLS (se não estiver ativo)
SELECT * FROM atualizar_feature_flag('ENABLE_RLS_POLICIES', true);

-- Ativar índices (se não estiver ativo)  
SELECT * FROM atualizar_feature_flag('ENABLE_PERFORMANCE_INDEXES', true);

-- Verificar flags ativas
SELECT * FROM listar_flags_ativas();
*/

-- Sistema PDV Dragon POS agora é enterprise-ready!
