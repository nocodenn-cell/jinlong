// Seleção de modo do gate de drift.
// Regras: PR com diff confirmado, sem produção e sem tocar no gate = informativo; tudo o mais = bloqueante.
import assert from "node:assert/strict";
import test from "node:test";

import { GATE_SELF_PATHS, selectDriftMode, touchesGatePaths, touchesProductionPaths } from "./drift-gate-mode.mjs";

const PR = (changedPaths, extra = {}) => ({ eventName: "pull_request", ref: "refs/pull/1/merge", changedPaths, diffOk: true, ...extra });

test("PR com diff confirmado, só frontend/docs/backend não produtivo: informativo", () => {
  const r = selectDriftMode(PR(["pdv-importados/app/caixa/x.tsx", "docs/ops/a.md", "backend/scripts/algo.mjs"]));
  assert.equal(r.mode, "informative");
});

test("PR com diff confirmado e lista vazia (sem alterações): informativo", () => {
  assert.equal(selectDriftMode(PR([])).mode, "informative");
});

test("PR com migration nova: bloqueante", () => {
  assert.equal(selectDriftMode(PR(["backend/supabase/migrations/20261106000000_nova.sql"])).mode, "blocking");
});

test("PR que altera function da edge: bloqueante", () => {
  assert.equal(selectDriftMode(PR(["backend/supabase/functions/sync-outbox/index.ts"])).mode, "blocking");
});

test("PR que altera config.toml: bloqueante", () => {
  assert.equal(selectDriftMode(PR(["backend/supabase/config.toml"])).mode, "blocking");
});

test("PR que altera o manifesto de adiadas: bloqueante", () => {
  assert.equal(selectDriftMode(PR([".github/deploy-governance/deferred-migrations.json"])).mode, "blocking");
});

test("PR que toca rollback (fora de caminho de produção): informativo", () => {
  assert.equal(selectDriftMode(PR(["backend/supabase/rollback/x.rollback.sql"])).mode, "informative");
});

test("PR que altera o próprio gate: bloqueante (não pode se auto-enfraquecer em modo informativo)", () => {
  for (const p of GATE_SELF_PATHS) {
    assert.equal(selectDriftMode(PR([p])).mode, "blocking", p);
  }
  assert.equal(selectDriftMode(PR(["backend/scripts/drift-gate-policy.test.mjs"])).mode, "blocking");
  assert.equal(selectDriftMode(PR(["backend/scripts/p0-exit-modes.test.mjs"])).mode, "blocking");
});

test("PR com diff NÃO confirmado: bloqueante mesmo sem caminhos de produção (fail-closed)", () => {
  assert.equal(selectDriftMode(PR([], { diffOk: false })).mode, "blocking");
  assert.equal(selectDriftMode(PR(["pdv-importados/a.ts"], { diffOk: false })).mode, "blocking");
});

test("push para main: bloqueante, inclusive sem nenhum caminho alterado", () => {
  assert.equal(selectDriftMode({ eventName: "push", ref: "refs/heads/main", changedPaths: [] }).mode, "blocking");
});

test("push para outra branch: bloqueante (fail-closed fora da regra)", () => {
  assert.equal(selectDriftMode({ eventName: "push", ref: "refs/heads/feature/x", changedPaths: [] }).mode, "blocking");
});

test("workflow_dispatch (liberação manual): bloqueante", () => {
  assert.equal(selectDriftMode({ eventName: "workflow_dispatch", changedPaths: [] }).mode, "blocking");
});

test("evento desconhecido ou vazio: bloqueante", () => {
  assert.equal(selectDriftMode({ eventName: "schedule", changedPaths: [] }).mode, "blocking");
  assert.equal(selectDriftMode({ eventName: "", changedPaths: [] }).mode, "blocking");
});

test("touchesProductionPaths reconhece exatamente os caminhos publicados", () => {
  assert.equal(touchesProductionPaths(["backend/supabase/migrations/a.sql"]), true);
  assert.equal(touchesProductionPaths(["backend/supabase/functions/x/index.ts"]), true);
  assert.equal(touchesProductionPaths(["backend/supabase/config.toml"]), true);
  assert.equal(touchesProductionPaths([".github/deploy-governance/deferred-migrations.json"]), true);
  assert.equal(touchesProductionPaths(["backend/supabase/rollback/a.sql"]), false);
  assert.equal(touchesProductionPaths(["pdv-importados/a.ts"]), false);
  assert.equal(touchesProductionPaths([]), false);
});

test("touchesGatePaths cobre o workflow, o guard, o script e os testes do gate", () => {
  assert.equal(touchesGatePaths([".github/workflows/migration-drift-main.yml"]), true);
  assert.equal(touchesGatePaths(["scripts/ops/deploy-governance-guard.mjs"]), true);
  assert.equal(touchesGatePaths(["backend/scripts/p0-migration-status.mjs"]), true);
  assert.equal(touchesGatePaths(["backend/scripts/drift-gate-mode.mjs"]), true);
  assert.equal(touchesGatePaths(["backend/scripts/outro.mjs"]), false);
  assert.equal(touchesGatePaths(["pdv-importados/a.ts"]), false);
});
