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
import {
  assertForbiddenNotReconciled,
  deriveForbiddenExit,
  forbiddenPendingApply,
  pendingApplyVersions,
} from "./forbidden-migration-apply.mjs";

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

/** Par completo de teste, reutilizado pelos 4 cenários de atomicidade abaixo. */
function parTeste() {
  return parseHumanGateRegistry(JSON.stringify({
    pairs: [{
      gitOnlyVersion: "20260820150000",
      remoteOnlyVersion: "20260820233832",
      reason: "Aplicada via MCP apply_migration em produção.",
      decisionDoc: "backend/supabase/README.md#migrations-aplicadas-via-mcp",
    }],
  }));
}

test("par completo (git_only + remote_only presentes) exige HUMAN_GATE", () => {
  const classified = applyHumanGateRegistry({
    blocking: [{ version: "20260820150000", reason: "remote_ausente", remote: null }],
    missingInList: [],
    extraBlocking: ["20260820233832"],
  }, parTeste());
  assert.equal(classified.blocking.length, 0);
  assert.equal(classified.extraBlocking.length, 0);
  assert.equal(classified.humanGate.length, 2);
  assert.equal(deriveOverallStatus(classified), "HUMAN_GATE");
  // HUMAN_GATE não bloqueia CI: a decisão já foi revisada no PR que registrou
  // a entrada em migration-human-gates.json (reason + decisionDoc validados).
  assert.equal(deriveExitCode("HUMAN_GATE", false), 0);
  assert.equal(deriveExitCode("HUMAN_GATE", true), 0);
});

test("só o lado git_only presente (par incompleto) continua BLOQUEANTE", () => {
  // Ambiente onde a migration nunca foi aplicada em nenhum formato: o
  // arquivo local aparece como drift (remote_ausente), mas a versão MCP
  // remota (20260820233832) nunca existiu ali — não há o que reconciliar.
  const classified = applyHumanGateRegistry({
    blocking: [{ version: "20260820150000", reason: "remote_ausente", remote: null }],
    missingInList: [],
    extraBlocking: [], // sem o par remoto neste ambiente
  }, parTeste());
  assert.equal(classified.blocking.length, 1);
  assert.equal(classified.humanGate.length, 0);
  assert.equal(deriveOverallStatus(classified), "BLOCKING_DRIFT");
});

test("só o lado remote_only presente (par incompleto) continua BLOQUEANTE", () => {
  const classified = applyHumanGateRegistry({
    blocking: [], // arquivo local não está em drift neste ambiente
    missingInList: [],
    extraBlocking: ["20260820233832"], // mas a versão remota aparece sozinha
  }, parTeste());
  assert.equal(classified.extraBlocking.length, 1);
  assert.equal(classified.humanGate.length, 0);
  assert.equal(deriveOverallStatus(classified), "BLOCKING_DRIFT");
});

test("ambiente/projeto diferente sem o par registrado continua BLOQUEANTE", () => {
  // Simula rodar o gate contra um projeto que nunca viu esta reconciliação:
  // o drift observado (ex.: uma migration totalmente diferente) não casa
  // com gitOnlyVersion nem remoteOnlyVersion do par conhecido — o par não
  // aceita nada, e o drift real permanece bloqueando.
  const classified = applyHumanGateRegistry({
    blocking: [{ version: "999999", reason: "remote_ausente", remote: null }],
    missingInList: [],
    extraBlocking: [],
  }, parTeste());
  assert.equal(classified.blocking.length, 1);
  assert.equal(classified.humanGate.length, 0);
  assert.equal(deriveOverallStatus(classified), "BLOCKING_DRIFT");
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

test("20261006120000 pendente de apply é FORBIDDEN_APPLY mesmo com warn-only", () => {
  const pending = pendingApplyVersions({
    blocking: [{ version: "20261006120000", reason: "remote_ausente", remote: null }],
    missingInList: [],
  });
  const hits = forbiddenPendingApply(pending);
  assert.deepEqual(hits, ["20261006120000"]);
  assert.equal(deriveForbiddenExit(hits, true), 1);
  assert.equal(deriveForbiddenExit([], true), 0);
});

test("par HUMAN_GATE não pode reconciliar a migration obsoleta", () => {
  assert.throws(
    () => assertForbiddenNotReconciled([{
      gitOnlyVersion: "20261006120000",
      remoteOnlyVersion: "20261006195837",
    }]),
    /FORBIDDEN_APPLY/,
  );
});

test("registro HUMAN_GATE inválido falha explicitamente", () => {
  assert.throws(() => parseHumanGateRegistry("não-json"), /JSON malformado/);
  assert.throws(() => parseHumanGateRegistry('{"pairs":{}}'), /deve ser uma lista/);
  assert.throws(
    () => parseHumanGateRegistry('{"pairs":[{"gitOnlyVersion":"abc","remoteOnlyVersion":"1","reason":"x","decisionDoc":"x"}]}'),
    /gitOnlyVersion deve ser numérica/,
  );
  assert.throws(
    () => parseHumanGateRegistry('{"pairs":[{"gitOnlyVersion":"1","remoteOnlyVersion":"abc","reason":"x","decisionDoc":"x"}]}'),
    /remoteOnlyVersion deve ser numérica/,
  );
});
