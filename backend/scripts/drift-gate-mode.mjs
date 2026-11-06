#!/usr/bin/env node
// Seleção do modo do gate de drift (ver docs/auditorias/RELATORIO_DRIFT_MIGRATIONS_PRODUCAO.md §23).
//
//   informative  -> divergência comum é registrada nos logs e NÃO bloqueia (--warn-only).
//                   Usado SÓ em PR com diff confirmado, sem caminhos de produção e sem tocar no próprio gate.
//   blocking     -> divergência bloqueia. Usado em: PR com caminhos de produção, PR que altera o gate,
//                   PR cujo diff não foi confirmado, push para main, workflow_dispatch e qualquer evento sem regra.
//
// Em TODOS os modos, `adiada_aplicada` continua bloqueando (ver resolveExitCode em p0-migration-status.mjs).
//
// Uso (CI):  node scripts/drift-gate-mode.mjs --event pull_request --ref refs/pull/1/merge \
//              --changed ../changed-paths.txt --diff-ok 1
// Escreve `mode=<blocking|informative>` em $GITHUB_OUTPUT, se existir, e imprime o motivo.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { PROD_PATHS } from "../../scripts/ops/deploy-governance-guard.mjs";

/**
 * Arquivos que definem o próprio gate. Um PR que os altera não pode rodar em modo informativo,
 * senão poderia enfraquecer a verificação e ainda passar.
 */
export const GATE_SELF_PATHS = [
  ".github/workflows/ci-backend-supabase.yml",
  ".github/workflows/migration-drift-main.yml",
  "scripts/ops/deploy-governance-guard.mjs",
  "backend/scripts/p0-migration-status.mjs",
  "backend/scripts/drift-gate-mode.mjs",
];
const GATE_SELF_PREFIXES = ["backend/scripts/drift-gate-", "backend/scripts/p0-exit-modes", "backend/scripts/p0-migration-status"];

/** true se algum caminho alterado está em caminho que a integração publica em produção. */
export function touchesProductionPaths(paths) {
  return (paths ?? []).some((p) => PROD_PATHS.some((pp) => p === pp || p.startsWith(pp)));
}

/** true se algum caminho alterado define o próprio gate (ver GATE_SELF_PATHS). */
export function touchesGatePaths(paths) {
  return (paths ?? []).some(
    (p) => GATE_SELF_PATHS.includes(p) || GATE_SELF_PREFIXES.some((pre) => p.startsWith(pre)),
  );
}

/**
 * @param {{ eventName: string, ref?: string, changedPaths?: string[], diffOk?: boolean }} input
 * @returns {{ mode: 'blocking' | 'informative', reason: string }}
 */
export function selectDriftMode({ eventName, ref = "", changedPaths = [], diffOk = false }) {
  if (eventName === "pull_request") {
    if (!diffOk) {
      return { mode: "blocking", reason: "diff da PR não confirmado (base/HEAD ausente ou falha de git): fail-closed" };
    }
    if (touchesProductionPaths(changedPaths)) {
      return { mode: "blocking", reason: "PR altera caminhos de produção (migrations, functions, config.toml ou manifesto)" };
    }
    if (touchesGatePaths(changedPaths)) {
      return { mode: "blocking", reason: "PR altera o próprio gate de drift: bloqueante" };
    }
    return { mode: "informative", reason: "PR com diff confirmado, sem caminhos de produção e sem alterar o gate" };
  }
  if (eventName === "push" && ref === "refs/heads/main") {
    return { mode: "blocking", reason: "push para main: drift bloqueante" };
  }
  if (eventName === "workflow_dispatch") {
    return { mode: "blocking", reason: "execução manual (liberação de produção): drift bloqueante" };
  }
  return { mode: "blocking", reason: `evento sem regra explícita (${eventName || "desconhecido"}): fail-closed` };
}

function parseArgs(argv) {
  const out = { event: "", ref: "", changed: "", diffOk: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--event") out.event = argv[++i] ?? "";
    else if (argv[i] === "--ref") out.ref = argv[++i] ?? "";
    else if (argv[i] === "--changed") out.changed = argv[++i] ?? "";
    else if (argv[i] === "--diff-ok") out.diffOk = argv[++i] ?? "";
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const hasList = Boolean(args.changed) && fs.existsSync(args.changed);
  const changedPaths = hasList
    ? fs.readFileSync(args.changed, "utf8").split("\n").map((s) => s.trim()).filter(Boolean)
    : [];
  // Só é confirmado se o passo de diff marcou sucesso E a lista existe. Qualquer outra coisa = não confirmado.
  const diffOk = args.diffOk === "1" && hasList;
  const { mode, reason } = selectDriftMode({ eventName: args.event, ref: args.ref, changedPaths, diffOk });
  console.log(`[drift-gate-mode] modo=${mode} motivo=${reason}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
