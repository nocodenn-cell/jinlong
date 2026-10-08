#!/usr/bin/env node
/**
 * Bloqueio permanente de migrations DESCARTAR_OBSOLETA.
 * Não apaga o arquivo: impede que um db push / apply trate a versão como pendente.
 *
 *   node scripts/forbidden-migration-apply.mjs --check-static
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, "supabase", "migrations");
const HUMAN_GATES_FILE = path.join(BACKEND_ROOT, "supabase", "migration-human-gates.json");

/** Deny-list canônica. Tem de bater com forbiddenApply no registro humano. */
export const FORBIDDEN_APPLY_DENYLIST = ["20261006120000"];

const REQUIRED_HEADER =
  "-- FORBIDDEN_APPLY: superseded by 20261006180000 / remote 20261006195837";

export function parseForbiddenApplyRegistry(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("Registro HUMAN_GATE inválido: JSON malformado.");
  }
  const list = payload?.forbiddenApply;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("Registro HUMAN_GATE inválido: forbiddenApply deve ser uma lista não vazia.");
  }
  const seen = new Set();
  return list.map((entry, index) => parseForbiddenEntry(entry, index, seen));
}

function parseForbiddenEntry(entry, index, seen) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Registro HUMAN_GATE inválido: forbiddenApply[${index}] não é objeto.`);
  }
  const version = String(entry.version ?? "").trim();
  const reason = String(entry.reason ?? "").trim();
  const decisionDoc = String(entry.decisionDoc ?? "").trim();
  if (!/^\d{8,}$/.test(version)) {
    throw new Error(`Registro HUMAN_GATE inválido: forbiddenApply[${index}].version deve ser numérica.`);
  }
  if (!reason || !decisionDoc) {
    throw new Error(`Registro HUMAN_GATE inválido: forbiddenApply[${index}] exige reason e decisionDoc.`);
  }
  if (seen.has(version)) {
    throw new Error(`Registro HUMAN_GATE inválido: forbiddenApply duplicado ${version}.`);
  }
  seen.add(version);
  return { version, reason, decisionDoc };
}

export function pendingApplyVersions({ blocking = [], missingInList = [] }) {
  const versions = new Set(missingInList);
  for (const entry of blocking) {
    if (entry?.reason === "remote_ausente" && entry.version) versions.add(entry.version);
  }
  return [...versions];
}

export function forbiddenPendingApply(pending, denyList = FORBIDDEN_APPLY_DENYLIST) {
  const deny = new Set(denyList);
  return pending.filter((version) => deny.has(version));
}

export function assertForbiddenNotReconciled(pairs, denyList = FORBIDDEN_APPLY_DENYLIST) {
  const deny = new Set(denyList);
  for (const pair of pairs) {
    if (deny.has(pair.gitOnlyVersion) || deny.has(pair.remoteOnlyVersion)) {
      throw new Error(
        `FORBIDDEN_APPLY: par HUMAN_GATE não pode reconciliar ${pair.gitOnlyVersion}<->${pair.remoteOnlyVersion}.`,
      );
    }
  }
}

export function deriveForbiddenExit(hits, _warnOnly = false) {
  return hits.length > 0 ? 1 : 0;
}

function migrationFileFor(version) {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.startsWith(`${version}_`));
  if (files.length !== 1) {
    throw new Error(`FORBIDDEN_APPLY: esperado 1 arquivo para ${version}, achei ${files.length}.`);
  }
  return path.join(MIGRATIONS_DIR, files[0]);
}

function assertHeader(version) {
  const file = migrationFileFor(version);
  const head = fs.readFileSync(file, "utf8").split(/\r?\n/).slice(0, 12).join("\n");
  if (!head.includes(REQUIRED_HEADER)) {
    throw new Error(`FORBIDDEN_APPLY: cabeçalho ausente em ${path.basename(file)}.`);
  }
  if (/^\s*GRANT\s+/im.test(head)) {
    throw new Error(`FORBIDDEN_APPLY: cabeçalho de ${version} não pode reabrir GRANT.`);
  }
}

function assertDenyListMatches(registry) {
  const fromJson = registry.map((entry) => entry.version).sort();
  const fromCode = [...FORBIDDEN_APPLY_DENYLIST].sort();
  if (fromJson.join(",") !== fromCode.join(",")) {
    throw new Error(
      `FORBIDDEN_APPLY: deny-list (${fromCode.join(",")}) ≠ forbiddenApply (${fromJson.join(",")}).`,
    );
  }
}

export function runStaticCheck(raw = fs.readFileSync(HUMAN_GATES_FILE, "utf8")) {
  const registry = parseForbiddenApplyRegistry(raw);
  assertDenyListMatches(registry);
  const payload = JSON.parse(raw);
  assertForbiddenNotReconciled(payload.pairs ?? []);
  for (const entry of registry) assertHeader(entry.version);
  return registry;
}

function main() {
  try {
    const registry = runStaticCheck();
    for (const entry of registry) {
      console.log(`FORBIDDEN_APPLY OK ${entry.version} — arquivo preservado, apply/push negado.`);
    }
  } catch (error) {
    console.error(String(error.message ?? error));
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) main();
