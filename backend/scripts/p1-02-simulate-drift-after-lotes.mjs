#!/usr/bin/env node
/**
 * P1-02 — simula classifyDriftEntries do tip #488 após cada lote.
 * Sem remoto. 163100 permanece blocking se não aplicada (bloqueio legítimo).
 */
import { classifyDriftEntries, loadForbiddenVersions } from "./p0-migration-status.mjs";

const TIP = [
  "20261007161220",
  "20261007163000",
  "20261007163100",
  "20261007163200",
  "20261007170000",
  "20261007171000",
  "20261007180000",
  "20261007190000",
  "20261008140000",
  "20261008140100",
];

const LOTE_A = [
  "20261007161220",
  "20261007163000",
  "20261007163200",
  "20261007170000",
  "20261007171000",
];
const LOTE_B = ["20261007180000", "20261007190000"];
const LOTE_C = ["20261008140000", "20261008140100"];

function sim(label, remotePresent) {
  const remote = new Set(remotePresent);
  const drift = TIP.filter((v) => !remote.has(v)).map((v) => ({
    version: v,
    reason: "remote_ausente",
    remote: null,
  }));
  const c = classifyDriftEntries(drift, loadForbiddenVersions());
  return {
    label,
    remote_ausente: drift.map((d) => d.version),
    blocking: c.blocking.map((d) => d.version),
    gate: c.blocking.length === 0 ? "GREEN" : "RED",
    blocking_count: c.blocking.length,
  };
}

const afterA = LOTE_A;
const afterB = [...LOTE_A, ...LOTE_B];
const afterC = [...afterB, ...LOTE_C];

const out = {
  note: "120000 fora de migrations/ (forbidden). 08120000 em pending-auth não entra no gate.",
  scenarios: [
    sim("agora", []),
    sim("após Lote A (sem 163100)", afterA),
    sim("após Lote B", afterB),
    sim("após Lote C (sem 163100)", afterC),
    sim("após A+B+C+163100", [...afterC, "20261007163100"]),
  ],
  conclusions: {
    after_A: "RED (5): 163100 + B + C",
    after_B: "RED (3): 163100 + C",
    after_C_sem_163100: "RED (1): 163100 — bloqueio LEGÍTIMO; não mascarar no gate",
    merge_488_safe:
      "blocking=[]: A+B+C aplicados (com HUMAN_GATE se MCP≠filename) E 163100 aplicada após GO comercial OU retirada explícita do path CLI (pending-auth) por decisão humana",
    lote_C_separavel:
      "Sim (aditivo), mas não fecha o gate sozinho enquanto 163100 estiver em migrations/ e ausente no remoto",
  },
};

const dest = process.env.P1_02_DRIFT_SIM_OUT;
if (dest) {
  const fs = await import("node:fs");
  fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
}
console.log(JSON.stringify(out, null, 2));
