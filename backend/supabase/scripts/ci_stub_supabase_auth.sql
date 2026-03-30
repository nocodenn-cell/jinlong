-- Stub mínimo do schema `auth` e helpers usados nas migrations Supabase,
-- para aplicar o SQL em PostgreSQL vanilla (smoke test no CI).
-- Não substitui projeto Supabase real; só valida ordem/sintaxe das migrations.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT 'authenticated'::text
$$;

-- Papel usado em GRANT ... TO authenticated nas migrations (existente no Supabase).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
END
$$;
