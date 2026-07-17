-- bootstrap-shim.sql — camada mínima de compatibilidade Supabase para provar
-- determinismo do bootstrap em um PostgreSQL puro (sem a imagem Supabase).
--
-- Fornece o que a imagem oficial do Supabase já traz e as migrations assumem:
-- roles (anon/authenticated/service_role/authenticator/supabase_*), schemas
-- (auth/storage/extensions/graphql_public/cron/net), stubs de auth.uid()/role()/
-- jwt()/email(), tabelas auth.users e storage.buckets/objects, a publication
-- supabase_realtime e stubs de pg_cron/pg_net (extensões indisponíveis fora da
-- imagem Supabase — não afetam a ordenação/determinismo das migrations).
--
-- Uso: ver bootstrap-determinism-check.sh. NÃO é migration; não vai para produção.

-- Shim Supabase mínimo para bootstrap determinístico (roles, auth, storage, cron/net, extensões)
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticator NOINHERIT LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_admin SUPERUSER; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_auth_admin; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_storage_admin; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO authenticator;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS graphql_public;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE SCHEMA IF NOT EXISTS net;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS citext;

-- auth.users (7 migrations têm FK para cá)
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);
-- auth.* stubs (retornam do GUC request.jwt.* como o Supabase real)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.email', true), '') $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

-- pg_cron / pg_net stubs (extensões indisponíveis fora da imagem Supabase)
CREATE OR REPLACE FUNCTION cron.schedule(text, text, text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE OR REPLACE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 5000) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE OR REPLACE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 5000) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;

GRANT USAGE ON SCHEMA auth, extensions, storage, graphql_public, cron, net TO anon, authenticated, service_role;
-- storage.buckets / objects (Supabase storage)
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, owner uuid, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(), public boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id),
  name text, owner uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  metadata jsonb
);
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS file_size_limit bigint;
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS allowed_mime_types text[];
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS avif_autodetection boolean DEFAULT false;
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS owner_id text;
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS path_tokens text[];
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS version text;
DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
