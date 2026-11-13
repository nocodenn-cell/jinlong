// Políticas combinadas (contexto -> modo -> código de saída), como o job de CI as compõe.
// Encadeamento real: selectDriftMode decide --warn-only (modo informativo); resolveExitCode decide o exit.
import assert from "node:assert/strict";
import test from "node:test";

import { resolveExitCode } from "./p0-migration-status.mjs";
import { selectDriftMode } from "./drift-gate-mode.mjs";
import { evaluate } from "../../scripts/ops/deploy-governance-guard.mjs";

const COMUM = [{ version: "20261023200000", reason: "remote_ausente" }];
const INTEGRIDADE = [{ version: "20261028100000", reason: "adiada_aplicada", remote: "20261028100000" }];

/** Contexto -> exit do gate, pelo mesmo caminho do CI (passo de modo -> --warn-only -> resolveExitCode). */
function exitFor(ctx, blocking) {
  const { mode } = selectDriftMode(ctx);
  const warnOnly = mode === "informative";
  return resolveExitCode({ status: blocking.length ? "BLOCKING_DRIFT" : "ALIGNED", warnOnly, blocking });
}
const PR_OK = (changedPaths) => ({ eventName: "pull_request", ref: "refs/pull/1/merge", changedPaths, diffOk: true });

test("PR com diff confirmado, sem produção, drift comum: exit 0 (informativo)", () => {
  assert.equal(exitFor(PR_OK(["pdv-importados/app/caixa/x.tsx"]), COMUM), 0);
});

test("PR com diff confirmado, sem produção, adiada_aplicada: exit 1", () => {
  assert.equal(exitFor(PR_OK(["pdv-importados/app/caixa/x.tsx"]), INTEGRIDADE), 1);
});

test("PR com migration + drift comum: exit 1", () => {
  assert.equal(exitFor(PR_OK(["backend/supabase/migrations/20261106000000_x.sql"]), COMUM), 1);
});

test("PR com functions/config.toml/manifesto + drift comum: exit 1", () => {
  for (const p of ["backend/supabase/functions/a/index.ts", "backend/supabase/config.toml", ".github/deploy-governance/deferred-migrations.json"]) {
    assert.equal(exitFor(PR_OK([p]), COMUM), 1, p);
  }
});

test("PR que altera o próprio gate + drift comum: exit 1 (não pode se auto-enfraquecer)", () => {
  assert.equal(exitFor(PR_OK([".github/workflows/migration-drift-main.yml"]), COMUM), 1);
  assert.equal(exitFor(PR_OK(["backend/scripts/drift-gate-mode.mjs"]), COMUM), 1);
});

test("PR com diff NÃO confirmado + drift comum: exit 1 (fail-closed)", () => {
  assert.equal(exitFor({ eventName: "pull_request", changedPaths: [], diffOk: false }, COMUM), 1);
});

test("push em main SEM alterações em backend + drift comum: exit 1 (bloqueante)", () => {
  assert.equal(exitFor({ eventName: "push", ref: "refs/heads/main", changedPaths: [] }, COMUM), 1);
});

test("push em main + adiada_aplicada: exit 1", () => {
  assert.equal(exitFor({ eventName: "push", ref: "refs/heads/main", changedPaths: [] }, INTEGRIDADE), 1);
});

test("workflow_dispatch (liberação) + drift comum: exit 1", () => {
  assert.equal(exitFor({ eventName: "workflow_dispatch", changedPaths: [] }, COMUM), 1);
});

test("migration adiada aplicada indevidamente bloqueia em TODOS os contextos", () => {
  const contextos = [
    PR_OK([]),
    PR_OK(["pdv-importados/a.ts"]),
    PR_OK(["backend/supabase/migrations/x.sql"]),
    { eventName: "pull_request", changedPaths: [], diffOk: false },
    { eventName: "push", ref: "refs/heads/main", changedPaths: [] },
    { eventName: "workflow_dispatch", changedPaths: [] },
    { eventName: "schedule", changedPaths: [] },
  ];
  for (const ctx of contextos) assert.equal(exitFor(ctx, INTEGRIDADE), 1, JSON.stringify(ctx));
});

test("manifesto alterado sem label: guard de governança falha (independente do modo do drift)", () => {
  const changes = [{ status: "M", paths: [".github/deploy-governance/deferred-migrations.json"] }];
  assert.ok(evaluate({ changes, labels: [], deferred: [], fileExists: () => true }).errors.length > 0);
});

test("sem alterações e sem divergência: exit 0 em qualquer modo", () => {
  assert.equal(exitFor(PR_OK([]), []), 0);
  assert.equal(exitFor({ eventName: "push", ref: "refs/heads/main", changedPaths: [] }, []), 0);
});
