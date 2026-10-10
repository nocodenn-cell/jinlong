import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  POSTGRES_IMAGE,
  assertDrillEnv,
  discardArgs,
  dumpExecArgs,
  emitDrillSql,
  fiscalEvidence,
  sourceRunArgs,
} from "./fiscal-drill-plano.mjs";
import { blockedRemoteRefs } from "./fiscal-p0-janela.mjs";

assert.equal(POSTGRES_IMAGE, "postgres:17-alpine");
assert.throws(
  () => assertDrillEnv({ SUPABASE_URL: `https://${blockedRemoteRefs[0]}.supabase.co` }),
  /BACKUP_ALVO_REMOTO_BLOQUEADO/,
);
assert.doesNotThrow(() => assertDrillEnv({ PATH: "C:\\Windows" }));

const run = sourceRunArgs().join(" ");
assert.match(run, /postgres:17-alpine/);
assert.equal(run.includes("--publish"), false);
assert.equal(run.includes("network"), false);
assert.deepEqual(discardArgs().slice(0, 2), ["rm", "-f"]);
assert.equal(dumpExecArgs("jinlong-fiscal-src").includes("pg_dump"), true);
assert.throws(() => fiscalEvidence({ fila: 2, payload: "xml" }), /EVIDENCIA_CAMPO_INVALIDO/);
assert.deepEqual(
  fiscalEvidence({
    fila: 2,
    eventos: 0,
    funcoes_public: 4,
    insert_authenticated: 0,
    anon_execute: false,
  }).fila,
  2,
);

const dir = await mkdtemp(join(tmpdir(), "jinlong-fiscal-drill-"));
await emitDrillSql(dir);
const bundle = await readFile(join(dir, "50-bundle.sql"), "utf8");
assert.equal(bundle.startsWith("BEGIN;"), true);
assert.match(bundle, /fiscal_sessao_privilegiada/);
assert.match(bundle, /REVOKE INSERT ON public.documentos_fiscais_pendentes/);
assert.equal(bundle.includes(blockedRemoteRefs[0]), false);
const abort = await readFile(join(dir, "51-abort.sql"), "utf8");
assert.match(abort, /SELECT 1\/0/);
assert.equal(/\nCOMMIT;/.test(abort), false);
await rm(dir, { recursive: true, force: true });
console.log("OK: plano do drill fiscal recusa remoto e emite so a janela");
