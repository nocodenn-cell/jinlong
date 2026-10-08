#!/usr/bin/env node
/**
 * P1-02 — prova mecânica de supersessão de 20261006120000.
 * Compara SQL normalizado (sem comentários) entre forbidden, 140000/140100 e 06180000.
 * Somente leitura de arquivos locais; sem remoto.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT =
  process.env.P1_02_COMPARE_OUT ||
  "/opt/cursor/artifacts/p1-02-120000-supersession-compare.json";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function norm(s) {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .toLowerCase();
}

function sha(s) {
  return crypto.createHash("sha256").update(norm(s)).digest("hex");
}

function bigramSim(a, b) {
  const A = norm(a);
  const B = norm(b);
  if (A === B) return 1;
  const big = (s) => {
    const o = new Set();
    for (let i = 0; i < s.length - 1; i += 1) o.add(s.slice(i, i + 2));
    return o;
  };
  const ba = big(A);
  const bb = big(B);
  let bi = 0;
  for (const x of ba) if (bb.has(x)) bi += 1;
  const bu = ba.size + bb.size - bi;
  return bu ? Number((bi / bu).toFixed(4)) : 0;
}

function extractFn(sql, qualName) {
  const re = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${qualName.replace(".", "\\.")}\\s*\\([\\s\\S]*?\\$([A-Za-z_]*)\\$[\\s\\S]*?\\$\\1\\$\\s*;`,
    "i",
  );
  const m = sql.match(re);
  return m ? m[0] : null;
}

function hasAutoPixLiquidation(body) {
  if (!body) return false;
  const n = norm(body);
  return n.includes("pix automática") || (n.includes("status = 'recebido'") && n.includes("financeiro_movimento"));
}

const f120 = read("supabase/migrations-forbidden/20261006120000_financeiro_contas_formas_e_painel.sql");
const f140 = read("supabase/migrations/20261008140000_formas_pagamento_conta_financeira_id.sql");
const f141 = read("supabase/migrations/20261008140100_financeiro_comando_v1_wrapper.sql");
const f0618 = read("supabase/migrations/20261006180000_financeiro_contas_operacionais.sql");

const wrap120 = extractFn(f120, "public.financeiro_comando");
const wrap141 = extractFn(f141, "public.financeiro_comando");
const capt120 = extractFn(f120, "internal.financeiro_capturar_venda");
const capt0618 = extractFn(f0618, "internal.financeiro_capturar_venda");

const report = {
  generated_at: new Date().toISOString(),
  pieces: {
    A_column: {
      "120000_add":
        "ADD COLUMN IF NOT EXISTS conta_financeira_id uuid REFERENCES public.contas_financeiras(id)",
      "140000_add": "ADD COLUMN IF NOT EXISTS conta_financeira_id uuid + FK condicional em DO",
      "140000_has_executable_painel_patch":
        /CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*financeiro_painel|entradas_periodo/.test(f140),
      successor: "20261008140000 (coluna tipada); liquidação canônica = financeiro_contas_forma",
    },
    B_captura: {
      present: { "120000": Boolean(capt120), "06180000": Boolean(capt0618) },
      sha_norm: {
        "120000": capt120 && sha(capt120),
        "06180000": capt0618 && sha(capt0618),
      },
      equal_norm: false,
      bigram_similarity: capt120 && capt0618 ? bigramSim(capt120, capt0618) : null,
      "120000_source": "formas_pagamento.conta_financeira_id",
      "06180000_source": "internal.financeiro_conta_forma → financeiro_contas_forma",
      "120000_auto_pix_liquidation": hasAutoPixLiquidation(capt120),
      "06180000_auto_pix_liquidation": hasAutoPixLiquidation(capt0618),
      remote_applied_as: "20261006195837 (MCP timestamp ≠ filename 20261006180000)",
    },
    C_wrapper: {
      present: { "120000": Boolean(wrap120), "140100": Boolean(wrap141) },
      sha_norm: {
        "120000": wrap120 && sha(wrap120),
        "140100": wrap141 && sha(wrap141),
      },
      equal_norm: wrap120 && wrap141 ? sha(wrap120) === sha(wrap141) : false,
      bigram_similarity: wrap120 && wrap141 ? bigramSim(wrap120, wrap141) : null,
      both_have_verbs: {
        "120000": Boolean(wrap120 && /INATIVAR_CONTA/.test(wrap120) && /VINCULAR_FORMA/.test(wrap120)),
        "140100": Boolean(wrap141 && /INATIVAR_CONTA/.test(wrap141) && /VINCULAR_FORMA/.test(wrap141)),
      },
    },
    D_painel: {
      "120000_patches_formas_legado":
        /formas_pagamento/.test(f120) && /entradas_periodo|financeiro_painel/.test(f120),
      "06180000_injects_contas_forma": /contas_forma/.test(f0618) && /financeiro_painel/.test(f0618),
      "140100_has_painel_patch": /financeiro_painel|contas_forma|entradas_periodo/.test(f141),
    },
  },
  verdict: {
    integral_operational_replacement:
      "06180000→195837 (captura+painel+contas_forma) + 140000 (coluna) + 140100 (wrapper)",
    reapply_120000:
      "NO-GO permanente — SHA captura ≠ 06180000; reaplicar remove liquidação PIX automática",
    note_terminology:
      "180000 no plano de descarte = 20261006180000; distinto de 20261007180000 (lote B)",
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${OUT}`);
