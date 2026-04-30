-- Migration: Feature Flags para Controle de Funcionalidades
-- Objetivo: Habilitar/desabilitar funcionalidades críticas sem deploy

CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT UNIQUE NOT NULL,
    descricao TEXT,
    ativo BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feature_flags_nome 
ON feature_flags(nome);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feature_flags_ativo 
ON feature_flags(ativo);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION feature_flags_updated_at_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS feature_flags_updated_at_trigger ON feature_flags;
CREATE TRIGGER feature_flags_updated_at_trigger
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION feature_flags_updated_at_trigger();

-- Inserir flags críticos do PDV
INSERT INTO feature_flags (nome, descricao, ativo) VALUES
    ('USE_UNIFIED_SALES_FLOW', 'Habilita múltiplas formas de pagamento na mesma venda', true),
    ('STRICT_MANAGER_DISCOUNT_AUTH', 'Autenticação rigorosa para descontos de gerente', true),
    ('AUTO_ENQUEUE_FISCAL_ON_SALE', 'Enfileirar documento fiscal automaticamente após venda', true),
    ('ENABLE_RLS_POLICIES', 'Ativar Row Level Security para multi-tenancy', true),
    ('ENABLE_PERFORMANCE_INDEXES', 'Ativar índices de performance para dashboards', true),
    ('ENABLE_IDEMPOTENCY_CHECK', 'Ativar verificação de idempotência na RPC de vendas', true),
    ('ENABLE_OFFLINE_MODE', 'Habilitar modo offline para operação sem internet', false),
    ('ENABLE_SYNC_QUEUE', 'Habilitar fila de sincronização para modo offline', false)
ON CONFLICT (nome) DO NOTHING;

-- Política RLS para feature flags (apenas admins podem modificar)
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY feature_flags_admin_policy ON feature_flags
  FOR ALL TO authenticated
  USING (auth.jwt()->>'papel' = 'ADMIN')
  WITH CHECK (auth.jwt()->>'papel' = 'ADMIN');

CREATE POLICY feature_flags_read_policy ON feature_flags
  FOR SELECT TO authenticated
  USING (true); -- Todos podem ler flags

-- Função para verificar se flag está ativa
CREATE OR REPLACE FUNCTION feature_flag_ativa(p_nome TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN COALESCE(
        (SELECT ativo FROM feature_flags WHERE nome = p_nome LIMIT 1),
        false
    );
END;
$$ LANGUAGE plpgsql;

-- Função para listar flags ativas
CREATE OR REPLACE FUNCTION listar_flags_ativas()
RETURNS TABLE(
    nome TEXT,
    descricao TEXT,
    ativo BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT nome, descricao, ativo
    FROM feature_flags
    WHERE ativo = true
    ORDER BY nome;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar flag (admin only)
CREATE OR REPLACE FUNCTION atualizar_feature_flag(
    p_nome TEXT,
    p_ativo BOOLEAN,
    p_descricao TEXT DEFAULT NULL
) RETURNS TABLE(
    sucesso BOOLEAN,
    mensagem TEXT
) AS $$
DECLARE
    v_admin BOOLEAN := (auth.jwt()->>'papel' = 'ADMIN');
BEGIN
    IF NOT v_admin THEN
        RETURN QUERY SELECT 
            false::BOOLEAN,
            'Apenas administradores podem modificar flags.'::TEXT;
        RETURN;
    END IF;
    
    UPDATE feature_flags 
    SET 
        ativo = p_ativo,
        descricao = COALESCE(p_descricao, descricao),
        updated_at = NOW()
    WHERE nome = p_nome;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            false::BOOLEAN,
            format('Flag "%s" não encontrada.', p_nome)::TEXT;
        RETURN;
    END IF;
    
    RETURN QUERY SELECT 
        true::BOOLEAN,
        format('Flag "%s" atualizada com sucesso.', p_nome)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- View para flags ativas (facilita consultas)
CREATE OR REPLACE VIEW v_flags_ativas AS
SELECT 
    nome,
    descricao,
    created_at,
    updated_at
FROM feature_flags
WHERE ativo = true;

-- Grant de permissões
GRANT SELECT ON feature_flags TO authenticated;
GRANT SELECT ON v_flags_ativas TO authenticated;
GRANT EXECUTE ON FUNCTION feature_flag_ativa TO authenticated;
GRANT EXECUTE ON FUNCTION listar_flags_ativas TO authenticated;
GRANT EXECUTE ON FUNCTION atualizar_feature_flag TO authenticated;

-- Comentários sobre uso:
/*
-- Para verificar se uma flag está ativa no frontend:
SELECT feature_flag_ativa('USE_UNIFIED_SALES_FLOW');

-- Para listar todas as flags ativas:
SELECT * FROM listar_flags_ativas();

-- Para atualizar uma flag (admin):
SELECT * FROM atualizar_feature_flag('ENABLE_RLS_POLICIES', true);

-- Flags disponíveis:
-- USE_UNIFIED_SALES_FLOW: Múltiplas formas de pagamento
-- STRICT_MANAGER_DISCOUNT_AUTH: Autenticação rigorosa gerente
-- AUTO_ENQUEUE_FISCAL_ON_SALE: Fiscal automático
-- ENABLE_RLS_POLICIES: Multi-tenancy seguro
-- ENABLE_PERFORMANCE_INDEXES: Índices de performance
-- ENABLE_IDEMPOTENCY_CHECK: Idempotência na RPC
-- ENABLE_OFFLINE_MODE: Modo offline
-- ENABLE_SYNC_QUEUE: Fila de sincronização
*/
