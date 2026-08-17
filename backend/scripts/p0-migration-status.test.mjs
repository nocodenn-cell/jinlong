import assert from "node:assert/strict";
import test from "node:test";

import {
  analyze,
  applyHumanGateRegistry,
  deriveExitCode,
  deriveOverallStatus,
  parseMigrationListOutput,
  parseMigrationListTable,
  parseHumanGateRegistry,
} from "./p0-migration-status.mjs";

test("interpreta JSON atual do Supabase CLI, inclusive linhas remote-only", () => {
  const parsed = parseMigrationListOutput(`Connecting to remote database...\n{
    "migrations": [
      {"local":"001","remote":"001","time":""},
      {"local":"20260810222702","remote":"","time":""},
      {"local":"","remote":"252","time":""}
    ]
  }`);

  assert.equal(parsed.format, "json");
  assert.deepEqual(parsed.rows, [
    { local: "001", remote: "001" },
    { local: "20260810222702", remote: null },
    { local: null, remote: "252" },
  ]);

  const result = analyze(parsed.rows, ["001", "20260810222702"]);
  assert.deepEqual(result.drift, [
    { version: "20260810222702", reason: "remote_ausente", remote: null },
  ]);
  assert.deepEqual(result.extraInList, ["252"]);
});

test("preserva parsing da tabela legada ASCII/Unicode", () => {
  const stdout = ` Local | Remote | Time (UTC)\n-------|--------|-----------\n \`001\` | \`001\` | \`001\`\n \`205\` | \` \` | \`205\`\n \` \` | \`252\` | \`252\`\n`;

  assert.deepEqual(parseMigrationListTable(stdout), [
    { local: "001", remote: "001" },
    { local: "205", remote: null },
    { local: null, remote: "252" },
  ]);
  assert.equal(parseMigrationListOutput(stdout).format, "legacy_table");
});

test("falha explicitamente em saída desconhecida ou JSON malformado", () => {
  assert.throws(
    () => parseMigrationListOutput("Connecting...\nsem tabela e sem JSON"),
    /Nenhuma migration foi interpretada/,
  );
  assert.throws(
    () => parseMigrationListOutput('{"migrations":[{"local":"abc","remote":"001"}]}'),
    /local não é numérico/,
  );
});

test("migration obrigatória git-only é drift bloqueante", () => {
  assert.equal(
    deriveOverallStatus({
      blocking: [{ version: "20260810222702" }],
      missingInList: [],
      extraBlocking: [],
    }),
    "BLOCKING_DRIFT",
  );
});

test("migration remote-only inesperada é drift bloqueante", () => {
  assert.equal(
    deriveOverallStatus({
      blocking: [],
      humanGate: [],
      missingInList: [],
      extraBlocking: ["999"],
    }),
    "BLOCKING_DRIFT",
  );
});

test("divergência explicitamente registrada exige HUMAN_GATE", () => {
  const gates = parseHumanGateRegistry(JSON.stringify({
    gates: [{
      version: "777",
      direction: "git_only",
      reason: "Decisão operacional pendente",
      decisionDoc: "docs/DEC-777.md",
    }],
  }));
  const classified = applyHumanGateRegistry({
    blocking: [{ version: "777", reason: "remote_ausente", remote: null }],
    missingInList: [],
    extraBlocking: [],
  }, gates);
  assert.equal(classified.blocking.length, 0);
  assert.equal(classified.humanGate.length, 1);
  assert.equal(deriveOverallStatus(classified), "HUMAN_GATE");
  assert.equal(deriveExitCode("HUMAN_GATE", false), 1);
  assert.equal(deriveExitCode("HUMAN_GATE", true), 1);
});

test("BLOCKING_DRIFT tem precedência sobre HUMAN_GATE", () => {
  assert.equal(
    deriveOverallStatus({
      blocking: [{ version: "999" }],
      humanGate: [{ version: "777" }],
      missingInList: [],
      extraBlocking: [],
    }),
    "BLOCKING_DRIFT",
  );
});

test("estado sem divergência é ALIGNED", () => {
  assert.equal(
    deriveOverallStatus({
      blocking: [],
      humanGate: [],
      missingInList: [],
      extraBlocking: [],
    }),
    "ALIGNED",
  );
});

test("registro HUMAN_GATE inválido falha explicitamente", () => {
  assert.throws(() => parseHumanGateRegistry("não-json"), /JSON malformado/);
  assert.throws(() => parseHumanGateRegistry('{"gates":{}}'), /deve ser uma lista/);
  assert.throws(
    () => parseHumanGateRegistry('{"gates":[{"version":"abc","direction":"git_only","reason":"x","decisionDoc":"x"}]}'),
    /version deve ser numérica/,
  );
});
