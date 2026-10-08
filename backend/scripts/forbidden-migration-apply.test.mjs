import assert from "node:assert/strict";
import test from "node:test";

import {
  FORBIDDEN_APPLY_DENYLIST,
  assertForbiddenNotReconciled,
  parseForbiddenApplyRegistry,
  runStaticCheck,
} from "./forbidden-migration-apply.mjs";

test("deny-list permanente contém só a migration obsoleta de contas", () => {
  assert.deepEqual(FORBIDDEN_APPLY_DENYLIST, ["20261006120000"]);
});

test("check estático exige cabeçalho, arquivo e registro sem par reconciliador", () => {
  const registry = runStaticCheck();
  assert.equal(registry.length, 1);
  assert.equal(registry[0].version, "20261006120000");
  assert.match(registry[0].reason, /DESCARTAR_OBSOLETA/);
  assert.match(registry[0].decisionDoc, /POS_OPS02_FASES_BCD_INTEGRIDADE/);
});

test("forbiddenApply malformado falha", () => {
  assert.throws(() => parseForbiddenApplyRegistry("{}"), /forbiddenApply deve ser uma lista/);
  assert.throws(
    () => parseForbiddenApplyRegistry(JSON.stringify({
      forbiddenApply: [{ version: "12", reason: "x", decisionDoc: "y" }],
    })),
    /version deve ser numérica/,
  );
});

test("par que cita a versão obsoleta no lado remoto também é recusado", () => {
  assert.throws(
    () => assertForbiddenNotReconciled([{
      gitOnlyVersion: "20261006180000",
      remoteOnlyVersion: "20261006120000",
    }]),
    /FORBIDDEN_APPLY/,
  );
});
