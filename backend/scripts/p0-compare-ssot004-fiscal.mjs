#!/usr/bin/env node
/**
 * Compara 20261007163200 (migrations/) vs 20261008120000 (pending-auth).
 * Somente leitura de arquivos locais.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const a = fs.readFileSync(
  path.join(ROOT, "supabase/migrations/20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql"),
  "utf8",
);
const b = fs.readFileSync(
  path.join(ROOT, "supabase/migrations-pending-auth/20261008120000_ssot_004_drop_policy_insert_documentos_fiscais.sql"),
  "utf8",
);

function sha(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

const out = {
  classification: "COMPLEMENTARES (não equivalentes; não conflitantes)",
  "163200": {
    path: "supabase/migrations/",
    sha256: sha(a),
    revoke_insert: /REVOKE\s+INSERT/i.test(a),
    drop_policy: /DROP\s+POLICY/i.test(a),
    prova_enqueue_rpc: /fiscal_enfileirar_documento_venda/i.test(a),
    prova_policy_gone: /pg_policies/i.test(a),
    objects: ["GRANT surface: REVOKE INSERT authenticated/anon", "prova RPC enqueue"],
  },
  "08120000": {
    path: "supabase/migrations-pending-auth/",
    sha256: sha(b),
    revoke_insert: /REVOKE\s+INSERT/i.test(b),
    drop_policy: /DROP\s+POLICY\s+IF\s+EXISTS\s+doc_fiscal_pendentes_insert_loja/i.test(b),
    prova_enqueue_rpc: /fiscal_enfileirar_documento_venda/i.test(b),
    prova_policy_gone: /pg_policies/i.test(b) && /doc_fiscal_pendentes_insert_loja/i.test(b),
    objects: ["DROP POLICY doc_fiscal_pendentes_insert_loja", "REVOKE INSERT (reafirma)"],
  },
  overlap: {
    both_revoke_insert: true,
    same_file_sha: sha(a) === sha(b),
  },
  remote_ro_2026_10_08: {
    auth_insert_grant: true,
    policy_doc_fiscal_pendentes_insert_loja: true,
    implication:
      "163200 sozinho remove GRANT; policy residual permanece. 08120000 remove policy. Ambos necessários para defesa em profundidade no estado atual do remoto.",
  },
  reapply_risk: {
    "163200": "Idempotente (REVOKE + provas)",
    "08120000": "Idempotente (DROP POLICY IF EXISTS + REVOKE)",
    order: "Seguro aplicar 163200 antes; 08120000 depois (ou com auth isolada). Não conflitam.",
  },
  recommendation:
    "Manter 08120000 em pending-auth até auth humana. Incluir no plano pós-Lote A como defesa opcional/recomendada, não como duplicata a descartar.",
};

const dest =
  process.env.P0_SSOT004_OUT ||
  "/opt/cursor/artifacts/p0-desbloqueio-ssot004-compare.json";
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
