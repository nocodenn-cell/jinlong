#!/usr/bin/env node
/**
 * P0 — drill de backup/restore com Postgres local sintético (sem PII / sem remoto).
 *
 * NÃO valida backup de produção. Prova apenas que o procedimento pg_dump -Fc →
 * pg_restore em destino isolado é reproduzível neste ambiente.
 *
 * Uso:
 *   node backend/scripts/p0-backup-restore-drill-synthetic.mjs
 *
 * Variáveis opcionais:
 *   PGHOST PGPORT PGUSER PGPASSWORD
 *   DRILL_OUT_DIR (default /opt/cursor/artifacts/p0-backup-drill)
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HOST = process.env.PGHOST || "127.0.0.1";
const PORT = process.env.PGPORT || "5432";
const USER = process.env.PGUSER || "fp_rollout";
const PASS = process.env.PGPASSWORD || "fp_rollout_local";
const OUT_DIR = process.env.DRILL_OUT_DIR || "/opt/cursor/artifacts/p0-backup-drill";
const SRC_DB = "fp_backup_src_synth";
const DST_DB = "fp_backup_dst_synth";
const ADMIN_URL = `postgresql://${USER}:${PASS}@${HOST}:${PORT}/postgres`;

function env() {
  return { ...process.env, PGPASSWORD: PASS, PGHOST: HOST, PGPORT: PORT, PGUSER: USER };
}

function run(bin, args, opts = {}) {
  return execFileSync(bin, args, {
    encoding: "utf8",
    env: env(),
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

function psqlUrl(db, sql) {
  return run("psql", [`postgresql://${USER}:${PASS}@${HOST}:${PORT}/${db}`, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql]);
}

function dropCreate(db) {
  run("psql", [ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-c", `
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname = '${db}' AND pid <> pg_backend_pid();
  `]);
  run("psql", [ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${db};`]);
  run("psql", [ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${db} OWNER ${USER};`]);
}

function seedSource() {
  psqlUrl(SRC_DB, `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS internal;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE TABLE public.lojas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL);
CREATE TABLE public.contas_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  nome text NOT NULL,
  ativo boolean DEFAULT true
);
CREATE TABLE public.financeiro_contas_forma (
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  forma_pagamento text NOT NULL,
  conta_financeira_id uuid NOT NULL REFERENCES public.contas_financeiras(id),
  PRIMARY KEY (loja_id, forma_pagamento)
);
CREATE TABLE public.documentos_fiscais_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  status text NOT NULL DEFAULT 'PENDENTE'
);
ALTER TABLE public.documentos_fiscais_pendentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY doc_fiscal_pendentes_insert_loja ON public.documentos_fiscais_pendentes
  FOR INSERT TO authenticated WITH CHECK (true);
GRANT SELECT, INSERT ON public.documentos_fiscais_pendentes TO authenticated;
CREATE OR REPLACE FUNCTION public.financeiro_comando(p_tipo text, p_dados jsonb, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object('ok', true, 'tipo', p_tipo);
END $$;
REVOKE ALL ON FUNCTION public.financeiro_comando(text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_comando(text, jsonb, uuid) TO authenticated;
INSERT INTO public.lojas(id, nome) VALUES ('11111111-1111-1111-1111-111111111111', 'Loja Sintetica');
INSERT INTO public.contas_financeiras(id, loja_id, nome)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Caixa Sintetica');
INSERT INTO public.financeiro_contas_forma(loja_id, forma_pagamento, conta_financeira_id)
VALUES ('11111111-1111-1111-1111-111111111111', 'PIX', '22222222-2222-2222-2222-222222222222');
`);
}

function snapshot(db) {
  const tables = psqlUrl(db, `
SELECT string_agg(relname || ':' || n_live_tup, ',' ORDER BY relname)
FROM pg_stat_user_tables WHERE schemaname='public';
`).trim();
  const fn = psqlUrl(db, `
SELECT count(*)::text FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='financeiro_comando';
`).trim();
  const pol = psqlUrl(db, `
SELECT count(*)::text FROM pg_policies
WHERE schemaname='public' AND tablename='documentos_fiscais_pendentes'
  AND policyname='doc_fiscal_pendentes_insert_loja';
`).trim();
  const grant = psqlUrl(db, `
SELECT has_table_privilege('authenticated','public.documentos_fiscais_pendentes','INSERT')::text;
`).trim();
  const contas = psqlUrl(db, `SELECT count(*)::text FROM public.financeiro_contas_forma;`).trim();
  return { tables, fn_financeiro_comando: fn, policy_insert: pol, auth_insert: grant, contas_forma_rows: contas };
}

function sha256File(file) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(file));
  return h.digest("hex");
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const dumpPath = path.join(OUT_DIR, "synthetic_fp.dump");
const reportPath = path.join(OUT_DIR, "drill-report.json");
const t0 = Date.now();

console.log("P0 backup/restore drill (synthetic)");
console.log(`SRC=${SRC_DB} DST=${DST_DB} OUT=${OUT_DIR}`);

// Ensure role can create DBs
try {
  run("psql", [
    `postgresql://postgres@${HOST}:${PORT}/postgres`,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${USER}') THEN
        CREATE ROLE ${USER} LOGIN PASSWORD '${PASS}' CREATEDB;
      ELSE
        ALTER ROLE ${USER} WITH LOGIN PASSWORD '${PASS}' CREATEDB;
      END IF;
    END $$;`,
  ]);
} catch {
  // peer auth as postgres via sudo
  execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c",
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${USER}') THEN
        CREATE ROLE ${USER} LOGIN PASSWORD '${PASS}' CREATEDB;
      ELSE
        ALTER ROLE ${USER} WITH LOGIN PASSWORD '${PASS}' CREATEDB;
      END IF;
    END $$;`], { encoding: "utf8" });
}

dropCreate(SRC_DB);
seedSource();
const before = snapshot(SRC_DB);

const dumpT0 = Date.now();
run("pg_dump", ["-Fc", "-f", dumpPath, "-d", `postgresql://${USER}:${PASS}@${HOST}:${PORT}/${SRC_DB}`]);
const dumpMs = Date.now() - dumpT0;
const dumpSha = sha256File(dumpPath);
const dumpBytes = fs.statSync(dumpPath).size;

dropCreate(DST_DB);
const restoreT0 = Date.now();
run("pg_restore", [
  "--no-owner",
  "--role",
  USER,
  "-d",
  `postgresql://${USER}:${PASS}@${HOST}:${PORT}/${DST_DB}`,
  dumpPath,
]);
const restoreMs = Date.now() - restoreT0;
const after = snapshot(DST_DB);

const ok =
  before.fn_financeiro_comando === after.fn_financeiro_comando &&
  before.policy_insert === after.policy_insert &&
  before.auth_insert === after.auth_insert &&
  before.contas_forma_rows === after.contas_forma_rows &&
  before.tables === after.tables;

const report = {
  ok,
  classification: "SYNTHETIC_DRILL_ONLY — NÃO é backup de produção validado",
  dump: { path: dumpPath, bytes: dumpBytes, sha256: dumpSha, duration_ms: dumpMs },
  restore: { destination: DST_DB, duration_ms: restoreMs },
  integrity: { before, after, match: ok },
  total_ms: Date.now() - t0,
  limitations: [
    "Dados sintéticos sem PII",
    "Não prova dump remoto Jinlong (Free / JIT PAM falhando)",
    "pg_restore --no-owner: ownership reatribuída ao role local",
    "Rollback pós-migration DDL continua limitado mesmo com dump",
  ],
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!ok) process.exit(1);
console.log(`\nRESTORE_DRILL_PASS (synthetic) → ${reportPath}`);
