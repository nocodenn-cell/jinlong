-- =============================================================================
-- REVOGA ACESSO À FUNÇÃO relatorio_consistencia_vendas
-- =============================================================================
--
-- Contexto:
--   O GATE9_DIAGNOSTICO_EXPOSTO do teste financial-adversarial-gates
--   falha porque a função relatorio_consistencia_vendas está executável
--   por authenticated.
--
--   Em produção, o REVOKE foi executado manualmente. Esta migration
--   garante que o banco local e o CI fiquem alinhados com produção.
-- =============================================================================

-- Revoga execução da função de authenticated
REVOKE EXECUTE ON FUNCTION public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz) FROM authenticated;

-- Garante que apenas SUPERUSER e roles específicas possam executar
-- (já está restrito por padrão após o REVOKE)

COMMENT ON FUNCTION public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz) IS 
  'Auditoria de consistência de vendas. Restrita - não executável por authenticated.';