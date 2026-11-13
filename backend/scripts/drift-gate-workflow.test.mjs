// Verifica, no TEXTO dos workflows, a fiação do gate de drift: triggers, modo, fail-closed e ausência de afrouxamento.
// Não executa o GitHub Actions. A execução real é o procedimento de docs/auditorias/PROCEDIMENTO_VALIDACAO_ACTIONS_DRIFT.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
const CI = read(".github/workflows/ci-backend-supabase.yml");
const MAIN = read(".github/workflows/migration-drift-main.yml");

function jobSection(src, name) {
  const start = src.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `job ${name} não encontrado`);
  const rest = src.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
const onBlock = (src) => src.slice(src.indexOf("\non:"), src.indexOf("\njobs:"));
const drift = jobSection(CI, "migration-remote-drift");
const driftMain = jobSection(MAIN, "migration-remote-drift-main");

// ---- ci-backend-supabase.yml (PR e dispatch) ----

test("ci-backend-supabase: PR continua com o escopo de backend; não há push (evita rodar os jobs pesados em todo push)", () => {
  assert.match(onBlock(CI), /\n {2}pull_request:\n {4}branches: \[main\]/);
  assert.doesNotMatch(onBlock(CI), /\n {2}push:/);
  assert.match(onBlock(CI), /workflow_dispatch:/);
});

test("ci-backend-supabase: passo de modo com id 'modo' e DIFF_OK explícito", () => {
  assert.match(drift, /- name: Modo do gate de drift\n {8}id: modo/);
  assert.match(drift, /DIFF_OK=0/);
  assert.match(drift, /DIFF_OK=1/);
  assert.match(drift, /--diff-ok "\$\{DIFF_OK\}"/);
});

test("ci-backend-supabase: falha de base/HEAD/diff quebra o passo (set -e, rev-parse, test -n)", () => {
  assert.match(drift, /set -euo pipefail/);
  assert.match(drift, /test -n "\$\{BASE_REF\}"/);
  assert.match(drift, /git rev-parse --verify --quiet "origin\/\$\{BASE_REF\}\^\{commit\}"/);
  assert.match(drift, /git rev-parse --verify --quiet "HEAD\^\{commit\}"/);
  assert.match(drift, /git diff --name-only "origin\/\$\{BASE_REF\}" HEAD > changed-paths\.txt/);
});

test("ci-backend-supabase: --warn-only só com modo informativo; nunca fixo", () => {
  assert.match(drift, /DRIFT_MODE: \$\{\{ steps\.modo\.outputs\.mode \}\}/);
  assert.match(drift, /if \[ "\$\{DRIFT_MODE\}" = "informative" \]; then FLAG="--warn-only"; fi/);
  assert.equal((drift.match(/p0-migration-status\.mjs[^\n]*--warn-only/g) ?? []).length, 0);
  assert.match(drift, /node scripts\/p0-migration-status\.mjs \$\{FLAG\}/);
});

test("ci-backend-supabase: job de drift sem continue-on-error", () => {
  assert.doesNotMatch(drift, /continue-on-error/);
});

test("ci-backend-supabase: secrets, link e base ref preservados", () => {
  assert.match(drift, /SUPABASE_MIGRATION_CHECK_PROJECT_REF/);
  assert.match(drift, /npx supabase link --project-ref/);
  assert.match(drift, /MIGRATION_DRIFT_BASE_REF="origin\/\$\{BASE_REF\}"/);
});

// ---- migration-drift-main.yml (push em main) ----

test("migration-drift-main: dispara em push para main SEM filtro de caminhos", () => {
  const on = onBlock(MAIN);
  assert.match(on, /\n {2}push:\n {4}branches: \[main\]\n/);
  assert.doesNotMatch(on, /paths:/, "filtro de paths impediria o drift em pushes sem backend/**");
  assert.match(on, /workflow_dispatch:/);
});

test("migration-drift-main: roda o gate SEM --warn-only (bloqueante sempre)", () => {
  assert.match(driftMain, /node scripts\/p0-migration-status\.mjs\s*\n/);
  assert.doesNotMatch(driftMain, /--warn-only/);
  assert.doesNotMatch(driftMain, /continue-on-error/);
});

test("migration-drift-main: sem MIGRATION_DRIFT_BASE_REF (em push não há PR)", () => {
  assert.doesNotMatch(driftMain, /^\s*export MIGRATION_DRIFT_BASE_REF=/m, "atribuição real encontrada (comentários são permitidos)");
});

test("migration-drift-main: permissões mínimas e concorrência sem cancelamento", () => {
  assert.match(MAIN, /permissions:\n {2}contents: read/);
  assert.match(MAIN, /cancel-in-progress: false/);
});

test("migration-drift-main: secrets obrigatórios e link preservados", () => {
  assert.match(driftMain, /SUPABASE_MIGRATION_CHECK_PROJECT_REF/);
  assert.match(driftMain, /npx supabase link --project-ref/);
  assert.match(driftMain, /Secrets obrigatórios ausentes/);
});

test("migration-drift-main: não escreve no manifesto nem em migrations", () => {
  assert.doesNotMatch(MAIN, /supabase migration (up|repair|new)|db push|apply_migration/);
  assert.doesNotMatch(MAIN, /deferred-migrations\.json.*(>|tee|sed -i)/);
});

test("ambos os workflows fixam ações por SHA (mesmo SHA de checkout e setup-node)", () => {
  const sha = /uses: (actions\/[a-z-]+)@([0-9a-f]{40})/g;
  const a = [...CI.matchAll(sha)].map((m) => m[0]);
  const b = [...MAIN.matchAll(sha)].map((m) => m[0]);
  for (const u of b) assert.ok(a.includes(u), `${u} não está no workflow de PR`);
});
