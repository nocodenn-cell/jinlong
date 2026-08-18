-- =============================================================================
-- REVOGA ACESSO ÀS FUNÇÕES DE CONSISTÊNCIA
-- =============================================================================
--
-- Contexto:
--   O GATE9_DIAGNOSTICO_EXPOSTO do teste financial-adversarial-gates
--   falha porque as funções de consistência estão executáveis por authenticated.
--
--   Em produção, o REVOKE foi executado manualmente para uma das funções.
--   Esta migration garante que o banco local e o CI fiquem alinhados com produção.
-- =============================================================================

-- Revoga execução da função relatorio_consistencia_vendas de authenticated
REVOKE EXECUTE ON FUNCTION public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz) FROM authenticated;

-- Revoga execução da função verificar_consistencia_venda de authenticated
-- (GATE9 também verifica esta função)
REVOKE EXECUTE ON FUNCTION public.verificar_consistencia_venda(uuid) FROM authenticated;

-- Garante que apenas SUPERUSER e roles específicas possam executar
-- (já está restrito por padrão após o REVOKE)

COMMENT ON FUNCTION public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz) IS 
  'Auditoria de consistência de vendas. Restrita - não executável por authenticated.';

COMMENT ON FUNCTION public.verificar_consistencia_venda(uuid) IS 
  'Verifica consistência de uma venda específica. Restrita - não executável por authenticated.';