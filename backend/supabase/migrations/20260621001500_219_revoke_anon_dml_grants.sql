-- 219 — Remove grants de escrita do papel `anon` no schema public (defesa em profundidade).
--
-- `anon` (não autenticado) tinha INSERT/UPDATE/DELETE em ~45 tabelas; só o RLS impedia o abuso.
-- Nenhuma política permite escrita anônima, então revogar não muda comportamento esperado e fecha
-- o risco caso o RLS de alguma tabela seja desabilitado por engano. SELECT de anon é mantido (sem
-- efeito hoje, pois nenhuma política libera leitura anônima). authenticated/service_role intactos.
--
-- ATENÇÃO: validar em staging antes de produção — se algum endpoint usar a chave anônima para
-- escrever, ele passará a falhar (esperado/desejado, mas precisa ser confirmado).

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

-- Tabelas futuras criadas pelo papel atual herdam a ausência de DML para anon.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;
