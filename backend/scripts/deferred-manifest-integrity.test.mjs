// Integridade do manifesto de migrations adiadas (leitura apenas; não altera o manifesto).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseDeferredManifest } from "./p0-migration-status.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RAW = readFileSync(`${ROOT}.github/deploy-governance/deferred-migrations.json`, "utf8");
const DOC = JSON.parse(RAW);

test("manifesto: JSON válido e campo deferred é array", () => {
  assert.ok(Array.isArray(DOC.deferred));
  assert.ok(DOC.deferred.length > 0);
});

test("manifesto: parseDeferredManifest aceita o arquivo real (fail-closed em formato inválido)", () => {
  const versions = parseDeferredManifest(RAW);
  assert.equal(versions.length, DOC.deferred.length);
});

test("manifesto: versões numéricas e sem duplicatas", () => {
  const versions = DOC.deferred.map((e) => e.version);
  for (const v of versions) assert.match(v, /^\d+$/, v);
  assert.equal(new Set(versions).size, versions.length, "versão duplicada no manifesto");
});

test("manifesto: cada entrada tem file, reason e releaseCondition não vazios", () => {
  for (const e of DOC.deferred) {
    for (const k of ["file", "reason", "releaseCondition"]) {
      assert.equal(typeof e[k], "string", `${e.version}.${k}`);
      assert.ok(e[k].trim().length > 0, `${e.version}.${k} vazio`);
    }
  }
});

test("manifesto: o arquivo de cada entrada existe no repositório e corresponde à versão", () => {
  for (const e of DOC.deferred) {
    assert.ok(existsSync(ROOT + e.file), `arquivo ausente: ${e.file}`);
    const base = e.file.split("/").pop();
    assert.ok(base.startsWith(`${e.version}_`), `arquivo ${base} não corresponde à versão ${e.version}`);
    assert.ok(e.file.startsWith("backend/supabase/migrations/"), `caminho fora de migrations: ${e.file}`);
  }
});

test("manifesto: 20261023200000 (troca de operador) NÃO está registrado — decisão do dono até validação com schema fiel", () => {
  const versions = DOC.deferred.map((e) => e.version);
  assert.ok(!versions.includes("20261023200000"), "registrar exige decisão do dono (ver RELATORIO §22.3)");
});
