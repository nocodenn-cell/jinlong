import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  acceptDeferredAppliedOnCheckProject,
  acceptRemoteOnlyOnCheckProject,
  analyze,
  applyHumanGateRegistry,
  deriveExitCode,
  deriveOverallStatus,
  parseMigrationListOutput,
  parseMigrationListTable,
  parseCheckProjectDeferredRegistry,
  parseDeferredManifest,
  parseHumanGateRegistry,
  separateDeferredMigrations,
  separatePrPendingMigrations,
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

test("migration nova do PR (ausente na base) não bloqueia; a que já está na base bloqueia", () => {
  const result = separatePrPendingMigrations(
    {
      blocking: [
        { version: "20261006120000", reason: "remote_ausente", remote: null },
        { version: "20261015120000", reason: "remote_ausente", remote: null },
      ],
      missingInList: ["20261015130000"],
    },
    ["001", "20261006120000"],
  );
  assert.deepEqual(result.blocking.map((d) => d.version), ["20261006120000"]);
  assert.deepEqual(result.missingInList, []);
  assert.deepEqual(result.prPending, ["20261015120000", "20261015130000"]);
});

test("sem ref de base o gate continua estrito", () => {
  const blocking = [{ version: "20261015120000", reason: "remote_ausente", remote: null }];
  const result = separatePrPendingMigrations({ blocking, missingInList: [] }, null);
  assert.deepEqual(result.blocking, blocking);
  assert.deepEqual(result.prPending, []);
});

test("divergência local≠remote não é tratada como pendência do PR", () => {
  const blocking = [{ version: "20261015120000", reason: "local_remote_diferentes", remote: "x" }];
  const result = separatePrPendingMigrations({ blocking, missingInList: [] }, ["001"]);
  assert.deepEqual(result.blocking, blocking);
  assert.deepEqual(result.prPending, []);
});

test("ignora o aviso de nova versão do CLI impresso após o JSON", () => {
  const parsed = parseMigrationListOutput(
    'Connecting...\n{"migrations":[{"local":"001","remote":"001","time":""}],"message":"ok"}\n' +
      "A new version of Supabase CLI is available: v9 (currently installed v1)\n",
  );
  assert.deepEqual(parsed.rows, [{ local: "001", remote: "001" }]);
});

test("migration adiada pela governança com remote_ausente não bloqueia e vira HUMAN_GATE", () => {
  const rows = [
    { local: "20261009000000", remote: "20261009000000" },
    { local: "20261010120000", remote: null },
  ];
  const { drift } = analyze(rows, ["20261009000000", "20261010120000"]);
  const r = separateDeferredMigrations({ blocking: drift, missingInList: [] }, rows, ["20261010120000"]);
  assert.deepEqual(r.blocking, []);
  assert.deepEqual(r.deferredPending, ["20261010120000"]);
  assert.deepEqual(r.deferredApplied, []);
  const status = deriveOverallStatus({ blocking: r.blocking, deferred: r.deferredPending, missingInList: r.missingInList, extraBlocking: [] });
  assert.equal(status, "HUMAN_GATE");
  assert.equal(deriveExitCode(status), 0);
});

test("migration adiada que aparece aplicada no remoto é violação e BLOQUEIA", () => {
  const rows = [{ local: "20261010120000", remote: "20261010120000" }];
  const { drift } = analyze(rows, ["20261010120000"]);
  const r = separateDeferredMigrations({ blocking: drift, missingInList: [] }, rows, ["20261010120000"]);
  assert.deepEqual(r.deferredApplied, ["20261010120000"]);
  assert.deepEqual(r.blocking.map((b) => b.reason), ["adiada_aplicada"]);
  const status = deriveOverallStatus({ blocking: r.blocking, deferred: r.deferredPending, missingInList: r.missingInList, extraBlocking: [] });
  assert.equal(status, "BLOCKING_DRIFT");
  assert.equal(deriveExitCode(status), 1);
});

test("migration não adiada com remote_ausente continua bloqueando; adiada fora da tabela do CLI não", () => {
  const rows = [{ local: "20261022020000", remote: null }];
  const { drift } = analyze(rows, ["20261010120000", "20261022020000"]);
  const r = separateDeferredMigrations({ blocking: drift, missingInList: ["20261010120000"] }, rows, ["20261010120000"]);
  assert.deepEqual(r.blocking.map((b) => b.version), ["20261022020000"]);
  assert.deepEqual(r.missingInList, []);
  assert.deepEqual(r.deferredPending, ["20261010120000"]);
});

test("sem manifesto (lista vazia) o comportamento é o estrito de antes", () => {
  const rows = [{ local: "20261010120000", remote: null }];
  const { drift } = analyze(rows, ["20261010120000"]);
  const r = separateDeferredMigrations({ blocking: drift, missingInList: [] }, rows, []);
  assert.deepEqual(r.blocking.map((b) => b.version), ["20261010120000"]);
  assert.deepEqual(r.deferredPending, []);
});

test("manifesto de adiadas: lê versões válidas e falha fechado quando malformado", () => {
  assert.deepEqual(
    parseDeferredManifest(JSON.stringify({ deferred: [{ version: "20261010120000", file: "x.sql" }] })),
    ["20261010120000"],
  );
  assert.throws(() => parseDeferredManifest("{"), /JSON/);
  assert.throws(() => parseDeferredManifest(JSON.stringify({})), /deferred/);
  assert.throws(() => parseDeferredManifest(JSON.stringify({ deferred: [{ version: "abc" }] })), /inválida/);
});

test("par com git JÁ alinhado aceita a duplicata remote_only (registro antigo com timestamp MCP)", () => {
  const rows = [
    { local: "20261009180000", remote: "20261009180000" },
    { local: null, remote: "20261009135940" },
  ];
  const { drift, extraInList } = analyze(rows, ["20261009180000"]);
  const pairs = parseHumanGateRegistry(JSON.stringify({ pairs: [{
    gitOnlyVersion: "20261009180000", remoteOnlyVersion: "20261009135940", reason: "fase A via MCP", decisionDoc: "docs/x.md",
  }] }));
  const sem = applyHumanGateRegistry({ blocking: drift, missingInList: [], extraBlocking: extraInList }, pairs);
  assert.deepEqual(sem.extraBlocking, ["20261009135940"], "sem as versões alinhadas continua estrito");
  const com = applyHumanGateRegistry({ blocking: drift, missingInList: [], extraBlocking: extraInList }, pairs, ["20261009180000"]);
  assert.deepEqual(com.extraBlocking, []);
  assert.deepEqual(com.humanGate.map((g) => g.divergence), ["duplicata_git_alinhado"]);
});

test("git alinhado NÃO justifica remote_only de outro par nem remote-only sem par", () => {
  const pairs = parseHumanGateRegistry(JSON.stringify({ pairs: [{
    gitOnlyVersion: "20261009180000", remoteOnlyVersion: "20261009135940", reason: "fase A", decisionDoc: "docs/x.md",
  }] }));
  const r = applyHumanGateRegistry(
    { blocking: [], missingInList: [], extraBlocking: ["20261009999999"] }, pairs, ["20261009180000"],
  );
  assert.deepEqual(r.extraBlocking, ["20261009999999"]);
  assert.deepEqual(r.humanGate, []);
});

const HOMOLOG_REF = "yvdilcmxyjafnnsfdtam";
const OUTRO_REF = "outroprojetoxxxxxxxxx"; // ref diferente do registro (não é produção)
const REGISTRO_HOMOLOG = {
  checkProjectRef: HOMOLOG_REF,
  accepted: [{ version: "20261010120000", reason: "aplicada no homolog", decisionDoc: "docs/ops/deploy-governance.md" }],
};

test("adiada aplicada no projeto de verificação registrado vira HUMAN_GATE (exit 0)", () => {
  const rows = [{ local: "20261010120000", remote: "20261010120000" }];
  const { drift } = analyze(rows, ["20261010120000"]);
  const r = separateDeferredMigrations({ blocking: drift, missingInList: [] }, rows, ["20261010120000"]);
  const acc = acceptDeferredAppliedOnCheckProject({ blocking: r.blocking }, REGISTRO_HOMOLOG, HOMOLOG_REF);
  assert.deepEqual(acc.blocking, []);
  assert.deepEqual(acc.accepted, ["20261010120000"]);
  assert.equal(acc.humanGate[0].divergence, "adiada_aplicada_no_projeto_de_verificacao");
  const status = deriveOverallStatus({ blocking: acc.blocking, humanGate: acc.humanGate, deferred: r.deferredPending, missingInList: r.missingInList, extraBlocking: [] });
  assert.equal(status, "HUMAN_GATE");
  assert.equal(deriveExitCode(status), 0);
});

test("mesma adiada aplicada, mas consultando outro projeto (ref diferente), continua BLOQUEANTE", () => {
  const blocking = [{ version: "20261010120000", reason: "adiada_aplicada", remote: "20261010120000" }];
  const acc = acceptDeferredAppliedOnCheckProject({ blocking }, REGISTRO_HOMOLOG, OUTRO_REF);
  assert.deepEqual(acc.blocking, blocking);
  assert.deepEqual(acc.accepted, []);
  assert.equal(deriveExitCode(deriveOverallStatus({ blocking: acc.blocking, humanGate: acc.humanGate, missingInList: [], extraBlocking: [] })), 1);
});

test("sem ref de verificação no ambiente (fail-closed) não aceita nada", () => {
  const blocking = [{ version: "20261010120000", reason: "adiada_aplicada", remote: "20261010120000" }];
  assert.deepEqual(acceptDeferredAppliedOnCheckProject({ blocking }, REGISTRO_HOMOLOG, "").blocking, blocking);
  assert.deepEqual(acceptDeferredAppliedOnCheckProject({ blocking }, REGISTRO_HOMOLOG, undefined).blocking, blocking);
});

test("adiada aplicada fora do registro continua BLOQUEANTE, mesmo no projeto registrado", () => {
  const blocking = [{ version: "20261028100000", reason: "adiada_aplicada", remote: "20261028100000" }];
  const acc = acceptDeferredAppliedOnCheckProject({ blocking }, REGISTRO_HOMOLOG, HOMOLOG_REF);
  assert.deepEqual(acc.blocking, blocking);
  assert.deepEqual(acc.accepted, []);
});

test("drift que não é adiada_aplicada (ex.: remote_ausente de migration não adiada) não é aceito pelo registro", () => {
  const blocking = [{ version: "20261010120000", reason: "remote_ausente", remote: null }];
  assert.deepEqual(acceptDeferredAppliedOnCheckProject({ blocking }, REGISTRO_HOMOLOG, HOMOLOG_REF).blocking, blocking);
});

test("registro do projeto de verificação: lê válido e falha fechado quando malformado", () => {
  const ok = parseCheckProjectDeferredRegistry(JSON.stringify(REGISTRO_HOMOLOG));
  assert.equal(ok.checkProjectRef, HOMOLOG_REF);
  assert.equal(ok.accepted[0].version, "20261010120000");
  assert.throws(() => parseCheckProjectDeferredRegistry("{não é json"), /JSON malformado/);
  assert.throws(() => parseCheckProjectDeferredRegistry(JSON.stringify({ ...REGISTRO_HOMOLOG, checkProjectRef: "curto" })), /checkProjectRef/);
  assert.throws(() => parseCheckProjectDeferredRegistry(JSON.stringify({ ...REGISTRO_HOMOLOG, accepted: [{ version: "20261010120000", reason: "", decisionDoc: "x" }] })), /reason e decisionDoc/);
  assert.throws(() => parseCheckProjectDeferredRegistry(JSON.stringify({ ...REGISTRO_HOMOLOG, accepted: [REGISTRO_HOMOLOG.accepted[0], REGISTRO_HOMOLOG.accepted[0]] })), /duplicada/);
});

test("só-remoto registrado no projeto de verificação vira HUMAN_GATE; outro ref continua BLOQUEANTE", () => {
  const registro = {
    checkProjectRef: HOMOLOG_REF,
    accepted: [],
    remoteOnlyAccepted: [{ version: "20261107210926", reason: "aplicada no homolog", decisionDoc: "docs/ops/deploy-governance.md" }],
  };
  const ok = acceptRemoteOnlyOnCheckProject({ extraBlocking: ["20261107210926", "20269999999999"] }, registro, HOMOLOG_REF);
  assert.deepEqual(ok.extraBlocking, ["20269999999999"]);
  assert.deepEqual(ok.accepted, ["20261107210926"]);
  assert.equal(ok.humanGate[0].divergence, "remote_only_no_projeto_de_verificacao");
  const outro = acceptRemoteOnlyOnCheckProject({ extraBlocking: ["20261107210926"] }, registro, OUTRO_REF);
  assert.deepEqual(outro.extraBlocking, ["20261107210926"]);
  assert.deepEqual(outro.accepted, []);
});

test("registro real: aceita exatamente as 36 divergências reprovadas no CI do homolog (sem ref de outro projeto)", () => {
  const raw = fs.readFileSync(new URL("../supabase/migration-check-project-deferred.json", import.meta.url), "utf8");
  const registro = parseCheckProjectDeferredRegistry(raw);
  const adiadas = [
    "20261010120000", "20261023130000", "20261028100000", "20261028101000", "20261028110000",
    "20261028120100", "20261028121000", "20261028122000", "20261029155000", "20261030100000",
    "20261030120000", "20261030130000", "20261030140000", "20261104120000", "20261104150000",
  ];
  const soRemoto = [
    "20261029153523", "20261029161123", "20261029161430", "20261029161519", "20261029161826",
    "20261029162055", "20261029162335", "20261029162411", "20261029162618", "20261029162645",
    "20261029163827", "20261029163941", "20261029163953", "20261029164014", "20261029175741",
    "20261029181913", "20261030002520", "20261106140207", "20261107205637", "20261107205702",
    "20261107210926",
  ];
  const blocking = adiadas.map((version) => ({ version, reason: "adiada_aplicada", remote: version }));
  const a = acceptDeferredAppliedOnCheckProject({ blocking }, registro, HOMOLOG_REF);
  assert.deepEqual(a.blocking, []);
  assert.equal(a.accepted.length, 15);
  const b = acceptRemoteOnlyOnCheckProject({ extraBlocking: soRemoto }, registro, HOMOLOG_REF);
  assert.deepEqual(b.extraBlocking, []);
  assert.equal(b.accepted.length, 21);
  const c = acceptDeferredAppliedOnCheckProject({ blocking }, registro, OUTRO_REF);
  const d = acceptRemoteOnlyOnCheckProject({ extraBlocking: soRemoto }, registro, OUTRO_REF);
  assert.equal(c.blocking.length, 15);
  assert.equal(d.extraBlocking.length, 21);
});
