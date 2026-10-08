#!/usr/bin/env node
/**
 * P0-05 — prova comportamental LOCAL (PGlite) de INSERT em documentos_fiscais_pendentes.
 *
 * NÃO conecta a produção. Carrega o SQL real de migrations-pending-auth quando aplicável.
 *
 * Cenários:
 *  1) hotfix GRANT → privilégio INSERT detectável no catálogo
 *  2) REVOKE → INSERT autenticado falha
 *  3) migration real DROP POLICY + REVOKE → policy sumiu; INSERT falha
 *  4) defesa em profundidade: re-GRANT após DROP → INSERT ainda falha (RLS)
 *  5) SECURITY DEFINER enqueue → INSERT ok
 *  6) anon após REVOKE → INSERT falha
 */
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIG_DROP = path.join(
  ROOT,
  'supabase/migrations-pending-auth/20261008120000_ssot_004_drop_policy_insert_documentos_fiscais.sql',
)

async function bootstrapSchema(db) {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;

    CREATE TABLE public.lojas (id uuid PRIMARY KEY);
    CREATE TABLE public.usuarios (
      id uuid PRIMARY KEY,
      loja_id uuid REFERENCES public.lojas(id),
      perfil text NOT NULL,
      ativo boolean NOT NULL DEFAULT true
    );

    CREATE TABLE public.documentos_fiscais_pendentes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id),
      venda_id uuid,
      tipo_doc text NOT NULL DEFAULT 'NFC_E_STUB',
      status text NOT NULL DEFAULT 'PENDENTE',
      payload jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE public.documentos_fiscais_pendentes ENABLE ROW LEVEL SECURITY;

    CREATE POLICY doc_fiscal_pendentes_insert_loja
      ON public.documentos_fiscais_pendentes
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.usuarios u
          WHERE u.id = auth.uid()
            AND u.ativo
            AND (u.perfil = 'ADMIN' OR u.loja_id = loja_id)
        )
      );

    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT SELECT ON public.usuarios, public.lojas TO authenticated;
    GRANT INSERT ON public.documentos_fiscais_pendentes TO authenticated;

    CREATE OR REPLACE FUNCTION public.fiscal_enfileirar_documento_venda_local(
      p_loja_id uuid,
      p_tipo text,
      p_payload jsonb
    ) RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO public
    AS $$
    DECLARE v_id uuid;
    BEGIN
      INSERT INTO public.documentos_fiscais_pendentes (loja_id, tipo_doc, payload)
      VALUES (p_loja_id, p_tipo, p_payload)
      RETURNING id INTO v_id;
      RETURN v_id;
    END;
    $$;
    REVOKE ALL ON FUNCTION public.fiscal_enfileirar_documento_venda_local(uuid, text, jsonb) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda_local(uuid, text, jsonb)
      TO authenticated, service_role;
  `)
}

async function seed(db, { lojaId, userId, perfil }) {
  await db.query('INSERT INTO public.lojas(id) VALUES ($1) ON CONFLICT DO NOTHING', [lojaId])
  await db.query(
    `INSERT INTO public.usuarios(id, loja_id, perfil, ativo)
     VALUES ($1,$2,$3,true)
     ON CONFLICT (id) DO UPDATE SET loja_id=EXCLUDED.loja_id, perfil=EXCLUDED.perfil`,
    [userId, lojaId, perfil],
  )
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId])
}

async function tryInsert(db, lojaId) {
  try {
    await db.query(
      `INSERT INTO public.documentos_fiscais_pendentes (loja_id, tipo_doc, payload)
       VALUES ($1, 'NFC_E_STUB', '{"origem":"negativo"}'::jsonb)`,
      [lojaId],
    )
    return false
  } catch (err) {
    return /permission denied|42501|row-level security|RLS/i.test(String(err?.message || err))
  }
}

/** Strip BEGIN/COMMIT/NOTIFY — PGlite fixture não precisa de reload PostgREST. */
function migrationSqlForPglite(raw) {
  return raw
    .replace(/^\s*BEGIN\s*;/im, '')
    .replace(/^\s*COMMIT\s*;/im, '')
    .replace(/NOTIFY\s+pgrst[^;]*;/gi, '')
}

test('P0-05: GRANT INSERT (hotfix) fica visível no catálogo — risco detectável', async () => {
  const db = await PGlite.create()
  await bootstrapSchema(db)
  const priv = await db.query(`
    SELECT has_table_privilege('authenticated', 'public.documentos_fiscais_pendentes', 'INSERT') AS ok
  `)
  assert.equal(priv.rows[0].ok, true)
  const policy = await db.query(`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE tablename = 'documentos_fiscais_pendentes'
      AND policyname = 'doc_fiscal_pendentes_insert_loja'
  `)
  assert.equal(policy.rows[0].n, 1)
  await db.close()
})

test('P0-05: REVOKE INSERT (SSOT-004) nega INSERT autenticado', async () => {
  const db = await PGlite.create()
  await bootstrapSchema(db)
  await db.exec(`REVOKE INSERT ON public.documentos_fiscais_pendentes FROM authenticated, anon;`)
  const lojaId = randomUUID()
  const userId = randomUUID()
  await seed(db, { lojaId, userId, perfil: 'GERENTE' })
  await db.query('SET ROLE authenticated')
  const denied = await tryInsert(db, lojaId)
  await db.query('RESET ROLE')
  assert.equal(denied, true)
  const count = await db.query('SELECT count(*)::int AS n FROM public.documentos_fiscais_pendentes')
  assert.equal(count.rows[0].n, 0)
  await db.close()
})

test('P0-05: migration real DROP POLICY remove policy; RPC DEFINER funciona', async () => {
  const db = await PGlite.create()
  await bootstrapSchema(db)
  const raw = readFileSync(MIG_DROP, 'utf8')
  assert.match(raw, /DROP POLICY IF EXISTS doc_fiscal_pendentes_insert_loja/)
  await db.exec(migrationSqlForPglite(raw))

  const policy = await db.query(`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE tablename = 'documentos_fiscais_pendentes'
      AND policyname = 'doc_fiscal_pendentes_insert_loja'
  `)
  assert.equal(policy.rows[0].n, 0, 'migration deve remover a policy')

  const lojaId = randomUUID()
  const userId = randomUUID()
  await seed(db, { lojaId, userId, perfil: 'ADMIN' })
  await db.query('SET ROLE authenticated')
  assert.equal(await tryInsert(db, lojaId), true)

  const rpc = await db.query(
    `SELECT public.fiscal_enfileirar_documento_venda_local($1, 'NFC_E_STUB', '{"ok":true}'::jsonb) AS id`,
    [lojaId],
  )
  await db.query('RESET ROLE')
  assert.ok(rpc.rows[0].id)
  const count = await db.query('SELECT count(*)::int AS n FROM public.documentos_fiscais_pendentes')
  assert.equal(count.rows[0].n, 1)
  await db.close()
})

test('P0-05: defesa em profundidade — re-GRANT após DROP POLICY ainda bloqueia INSERT', async () => {
  const db = await PGlite.create()
  await bootstrapSchema(db)
  await db.exec(migrationSqlForPglite(readFileSync(MIG_DROP, 'utf8')))
  // Simula hotfix perigoso que devolve GRANT sem recriar policy.
  await db.exec(`GRANT INSERT ON public.documentos_fiscais_pendentes TO authenticated;`)

  const lojaId = randomUUID()
  const userId = randomUUID()
  await seed(db, { lojaId, userId, perfil: 'OPERADOR' })
  await db.query('SET ROLE authenticated')
  const denied = await tryInsert(db, lojaId)
  await db.query('RESET ROLE')
  assert.equal(
    denied,
    true,
    'sem policy INSERT, RLS deve negar mesmo com GRANT (razão do DROP POLICY)',
  )
  await db.close()
})

test('P0-05: anon não recebe INSERT após REVOKE', async () => {
  const db = await PGlite.create()
  await bootstrapSchema(db)
  await db.exec(`REVOKE INSERT ON public.documentos_fiscais_pendentes FROM authenticated, anon;`)
  const lojaId = randomUUID()
  await db.query('INSERT INTO public.lojas(id) VALUES ($1)', [lojaId])
  await db.query('SET ROLE anon')
  const denied = await tryInsert(db, lojaId)
  await db.query('RESET ROLE')
  assert.equal(denied, true)
  await db.close()
})
