#!/usr/bin/env node
/**
 * Reproduz a comparação de equivalência semântica entre o corpo local de
 * `cancelar_venda_transacional` (migration 20260820150000, aplicada em
 * produção via MCP apply_migration e rastreada remotamente como
 * 20260820233832) e a definição implantada em produção.
 *
 * `cancelar-venda-remote-def.json` é a captura exata (sem retranscrição
 * manual) do resultado de, contra o projeto de produção:
 *
 *   SELECT pg_get_functiondef(oid) AS def
 *   FROM pg_proc WHERE proname = 'cancelar_venda_transacional';
 *
 * Uso (na pasta backend):
 *   node scripts/verify-cancelar-venda-equivalencia.mjs
 *
 * Saída esperada: MATCH, com o SHA-256 registrado em
 * migration-human-gates.json para o par 20260820150000/20260820233832.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");
const LOCAL_MIGRATION = path.join(
  BACKEND_ROOT,
  "supabase",
  "migrations",
  "20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql",
);
const REMOTE_DEF_JSON = path.join(__dirname, "cancelar-venda-remote-def.json");

const remoteDef = JSON.parse(readFileSync(REMOTE_DEF_JSON, "utf8")).def;
const localFile = readFileSync(LOCAL_MIGRATION, "utf8");

// Extração determinística: da linha "CREATE OR REPLACE FUNCTION
// public.cancelar_venda_transacional" até o "$function$;" que a fecha —
// por âncora de texto, não número de linha (frágil a edições futuras no
// cabeçalho do arquivo).
const startMarker = "CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional";
const endMarker = "$function$;";
const startIdx = localFile.indexOf(startMarker);
const endIdx = localFile.indexOf(endMarker, startIdx);
if (startIdx === -1 || endIdx === -1) {
  console.error("Não encontrei os marcadores de início/fim no arquivo local.");
  process.exit(1);
}
const localRaw = localFile.slice(startIdx, endIdx + endMarker.length);

/**
 * Normalização EXPLÍCITA (documentada, não arbitrária):
 * 1) CRLF -> LF.
 * 2) Remove o ";" terminador de instrução SQL no fim — `pg_get_functiondef`
 *    devolve só a definição da função, sem o ";" de fechamento da
 *    instrução CREATE FUNCTION, que o arquivo .sql precisa ter para ser
 *    SQL válido. Sem remover isso, os dois lados NUNCA baterão, mesmo
 *    sendo semanticamente a mesma função — foi exatamente o erro
 *    apontado em code review (Codex): um MD5 anterior fora calculado
 *    sem essa normalização e não reproduzia.
 * 3) Garante exatamente 1 newline final.
 */
function normalizar(texto) {
  return texto.replace(/\r\n/g, "\n").replace(/;\s*$/, "").replace(/\s*$/, "") + "\n";
}

const localNorm = normalizar(localRaw);
const remoteNorm = normalizar(remoteDef);

const localHash = createHash("sha256").update(localNorm, "utf8").digest("hex");
const remoteHash = createHash("sha256").update(remoteNorm, "utf8").digest("hex");

console.log("SHA-256 local (normalizado): ", localHash);
console.log("SHA-256 remoto (normalizado):", remoteHash);

if (localHash === remoteHash) {
  console.log("RESULTADO: MATCH — corpos idênticos após normalização documentada.");
  process.exit(0);
} else {
  console.log("RESULTADO: MISMATCH — corpos DIFERENTES. Não conceder a exceção.");
  const la = localNorm.split("\n");
  const lb = remoteNorm.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
    if (la[i] !== lb[i]) {
      console.log(`Primeira diferença na linha ${i + 1}:`);
      console.log("  local: ", JSON.stringify(la[i]));
      console.log("  remoto:", JSON.stringify(lb[i]));
      break;
    }
  }
  process.exit(1);
}
