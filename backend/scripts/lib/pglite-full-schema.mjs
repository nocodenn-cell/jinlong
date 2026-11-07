// Aplica TODAS as migrations do repositório (ordem de nome) num PGlite com stubs mínimos do Supabase
// (roles, auth.users/auth.uid/auth.role/auth.jwt, storage, extensions). Usado pelos testes de
// isolamento multiempresa para enumerar o catálogo REAL de tabelas.
import { readdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export async function loadPGlite() {
  const name = process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'
  const { PGlite } = await import(name)
  const ext = {}
  for (const [mod, key] of [['pg_trgm', 'pg_trgm'], ['uuid_ossp', 'uuid_ossp'], ['unaccent', 'unaccent'], ['citext', 'citext']]) {
    try {
      ext[key] = (await import(`@electric-sql/pglite/contrib/${mod}`))[key]
    } catch {
      // contrib indisponível: migrations dependentes falham e são reportadas
    }
  }
  return new PGlite({ extensions: ext })
}

export const SUPABASE_STUBS = `
  DO $$ BEGIN
    CREATE ROLE anon NOINHERIT; CREATE ROLE authenticated NOINHERIT; CREATE ROLE service_role NOINHERIT BYPASSRLS;
    CREATE ROLE supabase_admin; CREATE ROLE authenticator NOINHERIT; CREATE ROLE dashboard_user;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS storage;
  CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE SCHEMA IF NOT EXISTS vault; CREATE SCHEMA IF NOT EXISTS cron;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY, name text, statements text[]);
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb,
    raw_app_meta_data jsonb, created_at timestamptz DEFAULT now(), last_sign_in_at timestamptz, encrypted_password text,
    email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz, phone text, aud text, role text);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
    $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), CASE WHEN auth.uid() IS NULL THEN 'anon' ELSE 'authenticated' END) $$;
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
    $$ SELECT jsonb_build_object('sub', auth.uid(), 'role', auth.role()) $$;
  CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
  CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint,
    allowed_mime_types text[], created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), owner uuid);
  CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text,
    owner uuid, metadata jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  CREATE TABLE IF NOT EXISTS cron.job (jobid bigserial PRIMARY KEY, jobname text, schedule text, command text);
  CREATE OR REPLACE FUNCTION cron.unschedule(p text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public, auth, extensions, storage TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO PUBLIC;
`

export async function listMigrations() {
  const dir = new URL('../../supabase/migrations/', import.meta.url)
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  return { dir, files }
}

/** Aplica tudo; devolve { db, failed: [{file, error}] }. `until` (exclusivo) para parar antes de um arquivo. */
export async function applyAllMigrations({ until, verbose = false } = {}) {
  const db = await loadPGlite()
  await db.exec(SUPABASE_STUBS)
  for (const e of ['pg_trgm', '"uuid-ossp"', 'unaccent']) {
    try { await db.exec(`CREATE EXTENSION IF NOT EXISTS ${e} WITH SCHEMA extensions`) } catch { /* opcional */ }
  }
  await db.exec(`ALTER DATABASE postgres SET search_path = public, extensions`).catch(() => {})
  await db.exec(`SET search_path = public, extensions`)
  const { dir, files } = await listMigrations()
  const failed = []
  for (const f of files) {
    if (until && f >= until) break
    const sql = await readFile(new URL(f, dir), 'utf8')
    try {
      await db.exec(sql)
    } catch (e) {
      failed.push({ file: f, error: String(e.message ?? e).slice(0, 200) })
      await db.exec('ROLLBACK').catch(() => {})
      if (verbose) console.error(`FAIL ${f}: ${e.message}`)
    }
    await db.exec(`RESET ROLE; SET search_path = public, extensions`).catch(() => {})
  }
  return { db, failed, files }
}
