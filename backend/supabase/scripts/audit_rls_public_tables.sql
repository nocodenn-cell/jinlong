-- =============================================================================
-- Auditoria: RLS habilitado em tabelas base public (relkind = r)
-- =============================================================================
-- Rode no SQL Editor como postgres (ou role com leitura em pg_class).
-- Interpretação: relrowsecurity = false não implica bug — algumas tabelas só
-- são escritas por service_role; use para checklist de homologação (item 1.4).
-- =============================================================================

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;
