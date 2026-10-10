-- Role temporaria de leitura. Nao executar em producao nesta sprint.
-- Nao concede BYPASSRLS: pg_dump completo de tabela com RLS continua impossivel.

CREATE ROLE backup_ro
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

GRANT CONNECT ON DATABASE postgres TO backup_ro;
GRANT USAGE ON SCHEMA public TO backup_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_ro;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM backup_ro;
