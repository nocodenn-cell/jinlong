import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFiscalDrillTarget,
  assertRecoveryIsCanonical,
  blockedRemoteRefs,
  bundleFiscalP0,
  stripTxControl,
} from "./fiscal-p0-janela.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LOJA_A = id(1);
const LOJA_B = id(2);
const OP_A = id(3);
const GER_A = id(5);
const GER_B = id(6);
const ADMIN = id(8);
const INATIVO = id(15);
const CAIXA_A = id(9);
const CAIXA_B = id(10);
const VENDA_A = id(11);
const VENDA_B = id(12);
const DOC_A = id(13);
const DOC_B = id(14);
const JUST = "Cancelamento de teste local com mais de quinze caracteres";
const TABLES = [
  "lojas",
  "usuarios",
  "caixas",
  "vendas",
  "documentos_fiscais_pendentes",
  "documentos_fiscais_dlq",
  "documentos_fiscais_eventos",
];

function extractCreate(sql, functionName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}`;
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error(`função ausente: ${functionName}`);
  const end = sql.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`fim ausente: ${functionName}`);
  return sql.slice(start, end + 4);
}

function messageOf(error) {
  return error?.message ?? String(error);
}

async function expectReject(run, pattern) {
  try {
    await run();
  } catch (error) {
    assert.match(messageOf(error), pattern);
    return;
  }
  throw new Error(`esperava falha ${pattern}`);
}

async function openDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  return new PGlite();
}

async function historicalBodies() {
  const reprocess = await readFile(new URL("../supabase/migrations/20260806135429_307_d3_reaper_fiscal_em_processamento.sql", import.meta.url), "utf8");
  const enqueue = await readFile(new URL("../supabase/migrations/20260819220100_fase1b_fiscal_enfileirar_assinatura_unica.sql", import.meta.url), "utf8");
  const cancel = await readFile(new URL("./fixtures/fiscal_cancelar_documento.pre-isolamento.sql", import.meta.url), "utf8");
  const evento = await readFile(new URL("../supabase/migrations/090_fiscal_enqueue_on_conflict_and_erro_enqueue_evento.sql", import.meta.url), "utf8");
  return [
    extractCreate(reprocess, "fiscal_reprocessar_documento"),
    extractCreate(cancel, "fiscal_cancelar_documento"),
    extractCreate(enqueue, "fiscal_enfileirar_documento_venda"),
    extractCreate(evento, "fiscal_registrar_evento_enqueue_erro"),
  ].join("\n");
}

function schemaSql() {
  return `
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    CREATE ROLE anon NOINHERIT;
    CREATE ROLE authenticator SUPERUSER NOINHERIT;
    CREATE ROLE authenticated NOINHERIT;
    CREATE ROLE service_role NOINHERIT;
    GRANT anon, authenticated, service_role TO authenticator;
    CREATE TABLE lojas(id uuid PRIMARY KEY);
    CREATE TABLE usuarios(id uuid PRIMARY KEY, perfil text, loja_id uuid, ativo boolean);
    CREATE TABLE caixas(id uuid PRIMARY KEY, loja_id uuid);
    CREATE TABLE vendas(id uuid PRIMARY KEY, caixa_id uuid, operador_id uuid, tipo_venda text);
    CREATE TABLE documentos_fiscais_pendentes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venda_id uuid, tipo_doc text, status text, payload jsonb,
      ultimo_erro text, tentativas integer NOT NULL DEFAULT 0, proxima_tentativa_em timestamptz,
      fiscal_error_code text, fiscal_error_category text, fiscal_action_hint text,
      fiscal_retryable boolean, fiscal_next_step_url text, fiscal_error_payload jsonb,
      deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX idx_doc_fiscal_unique_venda_tipo
      ON documentos_fiscais_pendentes (venda_id, tipo_doc) WHERE status <> 'CANCELADO';
    CREATE TABLE documentos_fiscais_dlq(documento_id uuid, venda_id uuid);
    CREATE TABLE documentos_fiscais_eventos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), documento_id uuid, evento_tipo text,
      status_antes text, status_depois text, actor_user_id uuid, actor_role text,
      origem_acao text, payload jsonb
    );
    GRANT INSERT ON public.documentos_fiscais_pendentes TO authenticated, anon;
  `;
}

async function seed(db) {
  await db.exec(`
    INSERT INTO lojas VALUES ('${LOJA_A}'), ('${LOJA_B}');
    INSERT INTO usuarios VALUES
      ('${OP_A}', 'OPERADOR', '${LOJA_A}', true),
      ('${GER_A}', 'GERENTE', '${LOJA_A}', true),
      ('${GER_B}', 'GERENTE', '${LOJA_B}', true),
      ('${ADMIN}', 'ADMIN', NULL, true),
      ('${INATIVO}', 'GERENTE', '${LOJA_B}', false);
    INSERT INTO caixas VALUES ('${CAIXA_A}', '${LOJA_A}'), ('${CAIXA_B}', '${LOJA_B}');
    INSERT INTO vendas VALUES
      ('${VENDA_A}', '${CAIXA_A}', '${OP_A}', 'NFCE'),
      ('${VENDA_B}', '${CAIXA_B}', '${GER_B}', 'NFCE');
    INSERT INTO documentos_fiscais_pendentes (id, venda_id, tipo_doc, status, tentativas, ultimo_erro)
      VALUES ('${DOC_A}', '${VENDA_A}', 'NFC_E_STUB', 'ERRO', 2, 'falha A'),
             ('${DOC_B}', '${VENDA_B}', 'NFC_E_STUB', 'ERRO', 4, 'falha B');
    INSERT INTO documentos_fiscais_dlq VALUES ('${DOC_B}', '${VENDA_B}');
  `);
}

async function installHistorical(db, bodies) {
  await db.exec(bodies);
  await db.exec(`
    ALTER FUNCTION public.fiscal_reprocessar_documento(uuid) OWNER TO postgres;
    ALTER FUNCTION public.fiscal_cancelar_documento(uuid, text) OWNER TO postgres;
    ALTER FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) OWNER TO postgres;
    ALTER FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) OWNER TO postgres;
    GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.fiscal_cancelar_documento(uuid, text) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) TO authenticated, service_role;
  `);
}

async function logicalDump(db) {
  const data = {};
  for (const table of TABLES) {
    data[table] = (await db.query(`SELECT * FROM public.${table}`)).rows;
  }
  const functions = await db.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'fiscal_%'
    ORDER BY p.proname
  `);
  return { data, functions: functions.rows.map((row) => row.def) };
}

async function restoreDump(dump) {
  const db = await openDb();
  await db.exec(schemaSql());
  for (const table of TABLES) {
    for (const row of dump.data[table]) {
      const cols = Object.keys(row);
      const params = cols.map((_, index) => `$${index + 1}`);
      await db.query(
        `INSERT INTO public.${table} (${cols.join(",")}) VALUES (${params.join(",")})`,
        cols.map((col) => row[col]),
      );
    }
  }
  for (const def of dump.functions) await db.exec(def);
  await db.exec(`
    GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.fiscal_cancelar_documento(uuid, text) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) TO authenticated, service_role;
  `);
  return db;
}

async function docCount(db) {
  await asPostgres(db);
  const row = await db.query("SELECT count(*)::int AS n FROM public.documentos_fiscais_pendentes");
  return row.rows[0].n;
}

async function statusOf(db, docId) {
  await asPostgres(db);
  const row = await db.query("SELECT status FROM public.documentos_fiscais_pendentes WHERE id = $1", [docId]);
  return row.rows[0].status;
}

async function asPostgres(db) {
  await db.exec("RESET ROLE");
  await db.exec("SET SESSION AUTHORIZATION postgres");
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.query("SELECT set_config('request.jwt.claim.role', '', false)");
}

async function asSession(db, uid, jwtRole, dbRole) {
  await asPostgres(db);
  await db.exec("SET SESSION AUTHORIZATION authenticator");
  await db.exec(`SET ROLE ${dbRole}`);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.query("SELECT set_config('request.jwt.claim.role', $1, false)", [jwtRole]);
}

const precheckSql = `
DO $pre$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN RAISE EXCEPTION 'PRECHECK auth.uid'; END IF;
  IF to_regprocedure('auth.role()') IS NULL THEN RAISE EXCEPTION 'PRECHECK auth.role'; END IF;
  IF to_regclass('public.documentos_fiscais_pendentes') IS NULL THEN RAISE EXCEPTION 'PRECHECK fila'; END IF;
  IF to_regclass('public.documentos_fiscais_eventos') IS NULL THEN RAISE EXCEPTION 'PRECHECK eventos'; END IF;
  IF to_regclass('public.documentos_fiscais_dlq') IS NULL THEN RAISE EXCEPTION 'PRECHECK dlq'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'ativo'
  ) THEN RAISE EXCEPTION 'PRECHECK usuarios.ativo'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'caixas' AND column_name = 'loja_id'
  ) THEN RAISE EXCEPTION 'PRECHECK caixas.loja_id'; END IF;
END
$pre$;
`;

async function deadPredicate(db) {
  const row = await db.query(`
    SELECT position('current_user <> ''postgres''' in pg_get_functiondef('public.fiscal_reprocessar_documento(uuid)'::regprocedure)) AS pos
  `);
  return row.rows[0].pos;
}

async function main() {
  assertFiscalDrillTarget("pglite-local-descartavel");
  assert.throws(() => assertFiscalDrillTarget(blockedRemoteRefs[0]), /BACKUP_ALVO_REMOTO_BLOQUEADO/);
  assert.throws(() => assertFiscalDrillTarget(`https://${blockedRemoteRefs[1]}.supabase.co`), /BACKUP_ALVO_REMOTO_BLOQUEADO/);

  const isolacao = await readFile(new URL("../supabase/migrations/20261009220000_fiscal_rpc_isola_loja.sql", import.meta.url), "utf8");
  const revoke = await readFile(new URL("../supabase/migrations/20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql", import.meta.url), "utf8");
  const canceladoSsot = await readFile(new URL("../supabase/migrations/20261007161220_fiscal_cancelado_ssot.sql", import.meta.url), "utf8");
  const historicoFraco = await readFile(new URL("./fixtures/fiscal_cancelar_documento.pre-isolamento.sql", import.meta.url), "utf8");
  assert.equal(
    extractCreate(canceladoSsot, "fiscal_cancelar_documento"),
    extractCreate(isolacao, "fiscal_cancelar_documento"),
  );
  assert.match(historicoFraco, /perfil IN \('GERENTE', 'DONO', 'ADMIN'\)/);
  assert.doesNotMatch(historicoFraco, /FISCAL_CANCELAR_LOJA/);
  assert.throws(() => assertRecoveryIsCanonical(canceladoSsot, isolacao), /RECOVERY_RECUSA_SQL_NAO_CANONICO/);
  assertRecoveryIsCanonical(isolacao, isolacao);
  const bundle = bundleFiscalP0(isolacao, revoke);
  assert.equal(bundle.startsWith("BEGIN;"), true);
  assert.equal(bundle.trimEnd().endsWith("COMMIT;"), true);

  const bodies = await historicalBodies();
  const source = await openDb();
  await source.exec(schemaSql());
  await seed(source);
  await installHistorical(source, bodies);
  const dump = await logicalDump(source);
  assert.equal(dump.data.documentos_fiscais_pendentes.length, 2);
  await source.close();

  const restored = await restoreDump(dump);
  assert.equal(await docCount(restored), 2);
  assert.deepEqual(
    dump.data.documentos_fiscais_pendentes.map((row) => row.id).sort(),
    (await restored.query("SELECT id FROM public.documentos_fiscais_pendentes ORDER BY id")).rows.map((row) => row.id),
  );
  await restored.exec(precheckSql);

  const missing = await openDb();
  await missing.exec(schemaSql().replace("CREATE TABLE documentos_fiscais_eventos", "CREATE TABLE documentos_fiscais_eventos_ausente"));
  await expectReject(() => missing.exec(precheckSql), /PRECHECK eventos/);
  await missing.close();

  const aborted = await restoreDump(dump);
  await aborted.exec("BEGIN");
  try {
    await aborted.exec(stripTxControl(isolacao));
    await aborted.exec(stripTxControl(revoke));
    await aborted.query("SELECT 1/0");
    throw new Error("divisao por zero nao falhou");
  } catch (error) {
    if (messageOf(error) === "divisao por zero nao falhou") throw error;
    await aborted.exec("ROLLBACK");
  }
  assert.ok(await deadPredicate(aborted) > 0);
  await aborted.close();

  await restored.exec(bundle);
  await restored.exec(bundle);
  assert.equal(await docCount(restored), 2);
  const safe = await restored.query(`
    SELECT position('fiscal_sessao_privilegiada' in pg_get_functiondef('public.fiscal_reprocessar_documento(uuid)'::regprocedure)) > 0 AS helper,
           position('current_user <> ''postgres''' in pg_get_functiondef('public.fiscal_reprocessar_documento(uuid)'::regprocedure)) = 0 AS sem_predicado,
           position('FISCAL_CANCELAR_LOJA' in pg_get_functiondef('public.fiscal_cancelar_documento(uuid, text)'::regprocedure)) > 0 AS loja
  `);
  assert.equal(safe.rows[0].helper, true);
  assert.equal(safe.rows[0].sem_predicado, true);
  assert.equal(safe.rows[0].loja, true);
  const insertLeft = await restored.query(`
    SELECT count(*)::int AS n FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'documentos_fiscais_pendentes'
      AND grantee = 'authenticated' AND privilege_type = 'INSERT'
  `);
  assert.equal(insertLeft.rows[0].n, 0);

  await asSession(restored, "", "anon", "anon");
  await expectReject(() => restored.query("SELECT public.fiscal_reprocessar_documento($1)", [DOC_B]), /permission denied/);
  await asSession(restored, GER_A, "authenticated", "authenticated");
  await expectReject(() => restored.query("SELECT public.fiscal_reprocessar_documento($1)", [DOC_B]), /FISCAL_REPROCESSO_LOJA/);
  await asSession(restored, INATIVO, "authenticated", "authenticated");
  await expectReject(() => restored.query("SELECT public.fiscal_reprocessar_documento($1)", [DOC_B]), /FISCAL_REPROCESSO_PERFIL/);
  await asSession(restored, GER_B, "authenticated", "authenticated");
  await restored.query("SELECT public.fiscal_reprocessar_documento($1)", [DOC_B]);
  assert.equal(await docCount(restored), 2);
  assert.equal(await statusOf(restored, DOC_B), "PENDENTE");

  await asPostgres(restored);
  await restored.query("UPDATE public.documentos_fiscais_pendentes SET status = 'EMITIDO' WHERE id = $1", [DOC_B]);
  await asSession(restored, GER_A, "authenticated", "authenticated");
  await expectReject(
    () => restored.query("SELECT public.fiscal_cancelar_documento($1, $2)", [DOC_B, JUST]),
    /FISCAL_CANCELAR_LOJA/,
  );
  await asSession(restored, GER_B, "authenticated", "authenticated");
  await restored.query("SELECT public.fiscal_cancelar_documento($1, $2)", [DOC_B, JUST]);
  assert.equal(await docCount(restored), 2);
  assert.equal(await statusOf(restored, DOC_B), "CANCELADO");

  await asSession(restored, GER_A, "authenticated", "authenticated");
  await expectReject(
    () => restored.query("SELECT public.fiscal_enfileirar_documento_venda($1, 'NFCE', '{}'::jsonb)", [VENDA_B]),
    /FISCAL_ENQUEUE_PERMISSAO/,
  );
  assert.equal(await docCount(restored), 2);
  await asSession(restored, ADMIN, "service_role", "service_role");
  await restored.query("SELECT public.fiscal_enfileirar_documento_venda($1, 'NFCE', '{}'::jsonb)", [VENDA_A]);
  assert.equal(await docCount(restored), 3);

  await asPostgres(restored);
  await restored.exec(extractCreate(canceladoSsot, "fiscal_cancelar_documento"));
  const repetido = await restored.query(`
    SELECT position('FISCAL_CANCELAR_LOJA' in pg_get_functiondef('public.fiscal_cancelar_documento(uuid, text)'::regprocedure)) > 0 AS loja,
           position('u.ativo' in pg_get_functiondef('public.fiscal_cancelar_documento(uuid, text)'::regprocedure)) > 0 AS ativo
  `);
  assert.equal(repetido.rows[0].loja, true);
  assert.equal(repetido.rows[0].ativo, true);
  await restored.query("UPDATE public.documentos_fiscais_pendentes SET status = 'EMITIDO' WHERE id = $1", [DOC_B]);
  await asSession(restored, GER_A, "authenticated", "authenticated");
  await expectReject(
    () => restored.query("SELECT public.fiscal_cancelar_documento($1, $2)", [DOC_B, JUST]),
    /FISCAL_CANCELAR_LOJA/,
  );

  await asPostgres(restored);
  await restored.exec("DROP FUNCTION public.fiscal_cancelar_documento(uuid, text)");
  await restored.exec(isolacao);
  const back = await restored.query("SELECT to_regprocedure('public.fiscal_cancelar_documento(uuid, text)') IS NOT NULL AS ok");
  assert.equal(back.rows[0].ok, true);
  await restored.close();
  console.log("OK: backup, restore e janela fiscal em postgres local descartavel");
}

await main();
