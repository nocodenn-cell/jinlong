import assert from "node:assert/strict";
import test from "node:test";

import {
  analyze,
  deriveOverallStatus,
  parseMigrationListOutput,
  parseMigrationListTable,
} from "./p0-migration-status.mjs";

test("interpreta JSON atual do Supabase CLI, inclusive linhas remote-only", () => {
  const parsed = parseMigrationListOutput(`Connecting to remote database...\n{
    "migrations": [
      {"local":"001","remote":"001","time":""},
      {"local":"20260808130200","remote":"","time":""},
      {"local":"","remote":"252","time":""}
    ]
  }`);

  assert.equal(parsed.format, "json");
  assert.deepEqual(parsed.rows, [
    { local: "001", remote: "001" },
    { local: "20260808130200", remote: null },
    { local: null, remote: "252" },
  ]);

  const result = analyze(parsed.rows, ["001", "20260808130200"]);
  assert.deepEqual(result.drift, [
    { version: "20260808130200", reason: "remote_ausente", remote: null },
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

test("HUMAN GATE nunca é reportado como ALIGNED", () => {
  assert.equal(
    deriveOverallStatus({
      blocking: [],
      phase32GitOnly: [{ version: "20260808130200" }],
      missingInList: [],
      extraBlocking: [],
    }),
    "HUMAN_GATE",
  );
});

test("BLOCKING_DRIFT tem precedência e ALIGNED exige ausência total de pendências", () => {
  assert.equal(
    deriveOverallStatus({
      blocking: [{ version: "999" }],
      phase32GitOnly: [{ version: "20260808130200" }],
      missingInList: [],
      extraBlocking: [],
    }),
    "BLOCKING_DRIFT",
  );
  assert.equal(
    deriveOverallStatus({
      blocking: [],
      phase32GitOnly: [],
      missingInList: [],
      extraBlocking: [],
    }),
    "ALIGNED",
  );
});
