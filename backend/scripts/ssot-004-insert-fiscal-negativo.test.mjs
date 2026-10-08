/**
 * SSOT-004 — INSERT direto negado para anon/authenticated.
 * Postgres descartável (PGlite). Carrega a RPC e o REVOKE reais do Git.
 * Sem PII e sem conexão remota.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const migration = (name) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

const loja = randomUUID();
const operador = randomUUID();
const gerente = randomUUID();
const venda = randomUUID();
const caixa = randomUUID();

let db;

function sliceFrom(sql, startMarker, endMarker) {
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, startMarker);
  return sql.slice(start, end + endMarker.length);
}

async function query(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

before(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        current_user::text
      )
    $$;
    CREATE TABLE lojas(id uuid PRIMARY KEY);
    CREATE TABLE usuarios(id uuid PRIMARY KEY, loja_id uuid, perfil text, ativo boolean, nome text);
    CREATE TABLE caixas(id uuid PRIMARY KEY, loja_id uuid, operador_id uuid);
    CREATE TABLE vendas(
      id uuid PRIMARY KEY, caixa_id uuid, operador_id uuid, loja_id uuid,
      tipo_venda text, status text, forma_pagamento text, total_liquido numeric
    );
    CREATE TABLE documentos_fiscais_pendentes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venda_id uuid NOT NULL,
      tipo_doc text NOT NULL DEFAULT 'NFC_E_STUB',
      status text NOT NULL DEFAULT 'PENDENTE',
      payload jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      proxima_tentativa_em timestamptz
    );
    CREATE UNIQUE INDEX idx_doc_fiscal_unique_venda_tipo
      ON documentos_fiscais_pendentes (venda_id, tipo_doc)
      WHERE status <> 'CANCELADO';
    CREATE TABLE documentos_fiscais_eventos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      documento_id uuid NOT NULL,
      evento_tipo text NOT NULL,
      status_antes text,
      status_depois text,
      actor_user_id uuid,
      actor_role text,
      origem_acao text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    ALTER TABLE documentos_fiscais_pendentes ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    INSERT INTO lojas VALUES ('${loja}');
    INSERT INTO usuarios VALUES ('${operador}', '${loja}', 'OPERADOR', true, 'Op'),
      ('${gerente}', '${loja}', 'GERENTE', true, 'Ger');
    INSERT INTO caixas VALUES ('${caixa}', '${loja}', '${operador}');
    INSERT INTO vendas VALUES (
      '${venda}', '${caixa}', '${operador}', '${loja}', 'COM_NF', 'CONCLUIDA', 'PIX', 10
    );
  `);

  await db.exec(`
    CREATE POLICY doc_fiscal_pendentes_insert_loja
      ON documentos_fiscais_pendentes
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM usuarios u
          JOIN vendas v ON v.id = venda_id
          JOIN caixas c ON c.id = v.caixa_id
          WHERE u.id = auth.uid()
            AND (u.perfil = 'ADMIN' OR (u.perfil IN ('GERENTE', 'DONO') AND c.loja_id = u.loja_id))
        )
      );
    GRANT INSERT ON documentos_fiscais_pendentes TO authenticated;
  `);

  const rpc = sliceFrom(
    migration("20260819220100_fase1b_fiscal_enfileirar_assinatura_unica.sql"),
    "CREATE OR REPLACE FUNCTION public.fiscal_enfileirar_documento_venda(",
    "TO service_role, authenticated;",
  );
  await db.exec(rpc);
  await db.exec(migration("20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql"));
  await db.exec(migration("20261008013613_ssot_004_drop_policy_insert_fiscal.sql"));
});

after(async () => {
  await db?.close();
});

test("authenticated e anon não têm INSERT; a policy residual foi removida", async () => {
  const grants = await query(
    `SELECT grantee FROM information_schema.role_table_grants
     WHERE table_name = 'documentos_fiscais_pendentes' AND privilege_type = 'INSERT'
       AND grantee IN ('authenticated', 'anon')`,
  );
  assert.equal(grants.length, 0);
  const policies = await query(
    `SELECT policyname FROM pg_policies WHERE policyname = 'doc_fiscal_pendentes_insert_loja'`,
  );
  assert.equal(policies.length, 0);
});

async function insertAs(role) {
  await db.exec(`
    DO $neg$
    DECLARE ok boolean := false;
    BEGIN
      EXECUTE 'SET LOCAL ROLE ${role}';
      BEGIN
        INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status)
        VALUES ('${venda}', 'NFE', 'PENDENTE');
      EXCEPTION WHEN insufficient_privilege THEN
        ok := true;
      END;
      IF NOT ok THEN
        RAISE EXCEPTION 'INSERT_DIRETO_DEVERIA_FALHAR';
      END IF;
    END
    $neg$;
  `);
}

test("INSERT direto de authenticated falha com 42501", async () => {
  await insertAs("authenticated");
  const rows = await query(
    `SELECT count(*)::int AS n FROM documentos_fiscais_pendentes WHERE venda_id = $1 AND tipo_doc = 'NFE'`,
    [venda],
  );
  assert.equal(rows[0].n, 0);
});

test("INSERT direto de anon falha com 42501", async () => {
  await insertAs("anon");
});

test("anon não executa a RPC; operador e service_role enfileiram", async () => {
  await db.exec(`
    DO $anon$
    DECLARE ok boolean := false;
    BEGIN
      EXECUTE 'SET LOCAL ROLE anon';
      BEGIN
        PERFORM public.fiscal_enfileirar_documento_venda(
          '${venda}', 'NFC_E_STUB', '{}'::jsonb, '${loja}'
        );
      EXCEPTION WHEN insufficient_privilege THEN
        ok := true;
      END;
      IF NOT ok THEN
        RAISE EXCEPTION 'ANON_RPC_DEVERIA_FALHAR';
      END IF;
    END
    $anon$;
  `);

  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${operador}', false)`);
  await db.exec(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await db.exec("SET ROLE authenticated");
  const byUser = await query(
    `SELECT public.fiscal_enfileirar_documento_venda($1, 'NFC_E_STUB', '{"via":"authenticated"}'::jsonb, $2) AS id`,
    [venda, loja],
  );
  assert.ok(byUser[0].id);
  await db.exec("RESET ROLE");

  await db.exec(`SELECT set_config('request.jwt.claim.role', 'service_role', false)`);
  await db.exec("SET ROLE service_role");
  const byService = await query(
    `SELECT public.fiscal_enfileirar_documento_venda($1, 'NFCE', '{"via":"service_role"}'::jsonb, $2) AS id`,
    [venda, loja],
  );
  assert.ok(byService[0].id);
  await db.exec("RESET ROLE");

  const stored = await query(
    `SELECT tipo_doc FROM documentos_fiscais_pendentes WHERE venda_id = $1 ORDER BY tipo_doc`,
    [venda],
  );
  assert.deepEqual(stored.map((row) => row.tipo_doc), ["NFCE", "NFC_E_STUB"]);
});
