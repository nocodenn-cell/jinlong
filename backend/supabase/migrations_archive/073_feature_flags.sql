-- Feature Flags System
-- Permite controle granular de funcionalidades sem necessidade de múltiplos ambientes
-- Implementação seguindo boas práticas RLS do projeto fastproduct

-- Tabela de feature flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
    name TEXT PRIMARY KEY,
    enabled BOOLEAN DEFAULT FALSE,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários descritivos
COMMENT ON TABLE public.feature_flags IS 'Sistema de feature flags para controle de funcionalidades';
COMMENT ON COLUMN public.feature_flags.name IS 'Nome único da feature flag (ex: etiqueta_gerente)';
COMMENT ON COLUMN public.feature_flags.enabled IS 'Estado atual da feature (true/false)';
COMMENT ON COLUMN public.feature_flags.description IS 'Descrição human-readable da funcionalidade';
COMMENT ON COLUMN public.feature_flags.updated_at IS 'Timestamp da última atualização (mantido por trigger)';

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger se não existir
DROP TRIGGER IF EXISTS feature_flags_updated_at_trigger ON public.feature_flags;
CREATE TRIGGER feature_flags_updated_at_trigger
    BEFORE UPDATE ON public.feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION public.update_feature_flags_updated_at();

-- Ativar RLS na tabela
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Políticas RLS

-- SELECT: qualquer usuário autenticado pode ler flags (necessário para funcionamento do app)
CREATE POLICY "Feature flags - SELECT para authenticated" ON public.feature_flags
    FOR SELECT USING (auth.role() = 'authenticated');

-- INSERT/UPDATE/DELETE: apenas admin ou service_role podem modificar flags
-- Verifica se existe perfil admin na tabela usuarios, caso contrário restringe a service_role
CREATE POLICY "Feature flags - INSERT para admin/service_role" ON public.feature_flags
    FOR INSERT WITH CHECK (
        auth.role() = 'service_role' OR 
        (
            auth.role() = 'authenticated' AND 
            EXISTS (
                SELECT 1 FROM public.usuarios 
                WHERE usuarios.id = auth.uid() 
                AND usuarios.perfil = 'admin'
            )
        )
    );

CREATE POLICY "Feature flags - UPDATE para admin/service_role" ON public.feature_flags
    FOR UPDATE USING (
        auth.role() = 'service_role' OR 
        (
            auth.role() = 'authenticated' AND 
            EXISTS (
                SELECT 1 FROM public.usuarios 
                WHERE usuarios.id = auth.uid() 
                AND usuarios.perfil = 'admin'
            )
        )
    );

CREATE POLICY "Feature flags - DELETE para admin/service_role" ON public.feature_flags
    FOR DELETE USING (
        auth.role() = 'service_role' OR 
        (
            auth.role() = 'authenticated' AND 
            EXISTS (
                SELECT 1 FROM public.usuarios 
                WHERE usuarios.id = auth.uid() 
                AND usuarios.perfil = 'admin'
            )
        )
    );

-- Inserir flags iniciais usando ON CONFLICT para evitar duplicação
INSERT INTO public.feature_flags (name, enabled, description) VALUES
    (
        'importacao_xml',
        FALSE,
        'Extração de XML de Nota Fiscal de Compra - permite importar produtos diretamente de arquivos XML'
    ),
    (
        'etiqueta_gerente',
        TRUE,
        'Impressão de etiquetas pela interface do gerente - módulo já implementado e pronto para uso'
    ),
    (
        'novo_relatorio_vendas',
        FALSE,
        'Relatório de vendas com novos filtros e visualizações avançadas'
    )
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    updated_at = NOW();

-- Criar índice para performance (opcional, mas recomendado para consultas frequentes)
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON public.feature_flags(enabled);
CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON public.feature_flags(name);

-- Função para verificar se feature está enabled
-- Usada pelo frontend para verificar flags de forma eficiente
CREATE OR REPLACE FUNCTION public.is_feature_enabled(flag_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  flag_enabled BOOLEAN;
BEGIN
  -- Busca o valor da flag, padrão FALSE se não existir
  SELECT enabled INTO flag_enabled
  FROM public.feature_flags
  WHERE name = flag_name;
  
  RETURN COALESCE(flag_enabled, FALSE);
END;
$$;

-- Comentário descritivo da função
COMMENT ON FUNCTION public.is_feature_enabled(TEXT) IS 'Verifica se uma feature flag está ativada. Retorna FALSE se a flag não existir.';

-- Grant execute para authenticated (para ser chamado pelo frontend via RPC)
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(TEXT) TO authenticated;

-- Grant permissions
-- authenticated já tem SELECT via RLS
-- service_role tem todas as permissões via RLS
