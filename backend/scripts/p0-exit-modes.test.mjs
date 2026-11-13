// Matriz de código de saída do gate: status × motivo × modo (--warn-only).
// Regra: integridade (adiada_aplicada) bloqueia SEMPRE; divergências comuns são informativas com --warn-only.
import assert from "node:assert/strict";
import test from "node:test";

import { deriveExitCode, hasIntegrityViolation, resolveExitCode } from "./p0-migration-status.mjs";

const comum = { version: "20261023200000", reason: "remote_ausente" };
const remotoOrfao = { version: "20261009135940", reason: "remote_ausente" };
const integridade = { version: "20261028100000", reason: "adiada_aplicada", remote: "20261028100000" };

test("adiada_aplicada bloqueia mesmo com --warn-only", () => {
  assert.equal(resolveExitCode({ status: "BLOCKING_DRIFT", warnOnly: true, blocking: [integridade] }), 1);
});

test("adiada_aplicada bloqueia sem --warn-only", () => {
  assert.equal(resolveExitCode({ status: "BLOCKING_DRIFT", warnOnly: false, blocking: [integridade] }), 1);
});

test("adiada_aplicada misturada a divergências comuns continua bloqueando com --warn-only", () => {
  assert.equal(resolveExitCode({ status: "BLOCKING_DRIFT", warnOnly: true, blocking: [comum, integridade] }), 1);
});

test("divergência comum é informativa com --warn-only (exit 0)", () => {
  assert.equal(resolveExitCode({ status: "BLOCKING_DRIFT", warnOnly: true, blocking: [comum] }), 0);
});

test("divergência comum bloqueia sem --warn-only (exit 1)", () => {
  assert.equal(resolveExitCode({ status: "BLOCKING_DRIFT", warnOnly: false, blocking: [comum] }), 1);
});

test("remote_ausente de versão órfã segue o mesmo modo de divergência comum", () => {
  assert.equal(resolveExitCode({ status: "BLOCKING_DRIFT", warnOnly: true, blocking: [remotoOrfao] }), 0);
  assert.equal(resolveExitCode({ status: "BLOCKING_DRIFT", warnOnly: false, blocking: [remotoOrfao] }), 1);
});

test("ALINHADO e HUMAN_GATE dão exit 0 nos dois modos", () => {
  for (const status of ["ALIGNED", "HUMAN_GATE"]) {
    assert.equal(resolveExitCode({ status, warnOnly: false, blocking: [] }), 0, `${status} sem warn`);
    assert.equal(resolveExitCode({ status, warnOnly: true, blocking: [] }), 0, `${status} com warn`);
  }
});

test("status sem entradas de bloqueio não vira integridade", () => {
  assert.equal(hasIntegrityViolation([]), false);
  assert.equal(hasIntegrityViolation(undefined), false);
  assert.equal(hasIntegrityViolation([comum]), false);
  assert.equal(hasIntegrityViolation([integridade]), true);
});

test("deriveExitCode mantém o contrato anterior (sem regressão)", () => {
  assert.equal(deriveExitCode("BLOCKING_DRIFT", false), 1);
  assert.equal(deriveExitCode("BLOCKING_DRIFT", true), 0);
  assert.equal(deriveExitCode("HUMAN_GATE", false), 0);
  assert.equal(deriveExitCode("ALIGNED", false), 0);
});
