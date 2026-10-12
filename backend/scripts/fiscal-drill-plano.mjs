import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFiscalDrillTarget,
  blockedRemoteRefs,
  bundleFiscalP0,
  stripTxControl,
} from "./fiscal-p0-janela.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const POSTGRES_IMAGE = "postgres:17-alpine";
export const SOURCE_CONTAINER = "jinlong-fiscal-src";
export const RESTORE_CONTAINER = "jinlong-fiscal-dst";

const EVIDENCE_KEYS = [
  "fila",
  "eventos",
  "funcoes_public",
  "insert_authenticated",
  "anon_execute",
];

export function assertDrillEnv(env) {
  const blob = Object.values(env ?? {}).join("\n");
  assertFiscalDrillTarget("postgres-local-descartavel");
  for (const blocked of blockedRemoteRefs) {
    if (blob.toLowerCase().includes(blocked)) {
      throw new Error(`BACKUP_ALVO_REMOTO_BLOQUEADO:${blocked}`);
    }
  }
  if (/supabase\.co|pooler\.supabase/i.test(blob)) {
    throw new Error("BACKUP_ALVO_REMOTO_BLOQUEADO");
  }
}

export function sourceRunArgs() {
  return [
    "run", "-d", "--rm", "--name", SOURCE_CONTAINER,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e", "POSTGRES_PASSWORD=drill-local",
    POSTGRES_IMAGE,
  ];
}

export function discardArgs() {
  return ["rm", "-f", SOURCE_CONTAINER, RESTORE_CONTAINER];
}

export function dumpExecArgs(container) {
  return [
    "exec", container, "pg_dump", "-U", "postgres",
    "--schema=public", "--no-owner", "--format=plain", "postgres",
  ];
}

export function fiscalEvidence(counts) {
  const out = {};
  for (const key of EVIDENCE_KEYS) {
    const value = counts?.[key];
    const valid = typeof value === "number" || typeof value === "boolean";
    if (!valid) throw new Error(`EVIDENCIA_CAMPO_INVALIDO:${key}`);
    out[key] = value;
  }
  return out;
}

function extractCreate(sql, functionName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}`;
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error(`função ausente: ${functionName}`);
  const end = sql.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`fim ausente: ${functionName}`);
  return sql.slice(start, end + 4);
}

async function readMigration(name) {
  return readFile(join(HERE, "../supabase/migrations", name), "utf8");
}

export async function emitDrillSql(dir) {
  await mkdir(dir, { recursive: true });
  const reprocess = await readMigration("20260806135429_307_d3_reaper_fiscal_em_processamento.sql");
  const enqueue = await readMigration("20260819220100_fase1b_fiscal_enfileirar_assinatura_unica.sql");
  const cancel = await readFile(new URL("./fixtures/fiscal_cancelar_documento.pre-isolamento.sql", import.meta.url), "utf8");
  const evento = await readMigration("090_fiscal_enqueue_on_conflict_and_erro_enqueue_evento.sql");
  const isolacao = await readMigration("20261009220000_fiscal_rpc_isola_loja.sql");
  const revoke = await readMigration("20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql");
  const historico = [
    extractCreate(reprocess, "fiscal_reprocessar_documento"),
    extractCreate(cancel, "fiscal_cancelar_documento"),
    extractCreate(enqueue, "fiscal_enfileirar_documento_venda"),
    extractCreate(evento, "fiscal_registrar_evento_enqueue_erro"),
  ].join("\n");
  const aberto = `BEGIN;\n${stripTxControl(isolacao)}\n${stripTxControl(revoke)}\nSELECT 1/0;\n`;
  await writeFile(join(dir, "20-historico.sql"), historico);
  await writeFile(join(dir, "50-bundle.sql"), bundleFiscalP0(isolacao, revoke));
  await writeFile(join(dir, "51-abort.sql"), aberto);
}

function printArgs(args) {
  process.stdout.write(`${args.join(" ")}\n`);
}

async function main() {
  const [command, dir] = process.argv.slice(2);
  if (command === "assert-env") {
    assertDrillEnv(process.env);
    return;
  }
  if (command === "print-source") {
    printArgs(sourceRunArgs());
    return;
  }
  if (command === "print-discard") {
    printArgs(discardArgs());
    return;
  }
  if (command === "emit" && dir) {
    await emitDrillSql(dir);
    return;
  }
  throw new Error("uso: assert-env | print-source | print-discard | emit <dir>");
}

if (process.argv[1] && process.argv[1].endsWith("fiscal-drill-plano.mjs")) {
  await main();
}
