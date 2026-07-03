#!/usr/bin/env node
/**
 * Compara a coluna Local vs Remote de `npx supabase migration list` (cwd: backend)
 * com os arquivos em supabase/migrations/*.sql.
 *
 * Uso (na pasta backend):
 *   node scripts/p0-migration-status.mjs
 *   node scripts/p0-migration-status.mjs --json
 *   node scripts/p0-migration-status.mjs --warn-only   # exit 0 mesmo com drift
 *
 * Requer: Supabase CLI linkado (`npx supabase link`) ao projeto remoto alvo.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, "supabase", "migrations");

function readArgs(argv) {
  return {
    json: argv.includes("--json"),
    warnOnly: argv.includes("--warn-only"),
  };
}

function listMigrationVersionsFromDisk() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const versions = [];
  for (const f of files) {
    const m = /^(\d+)_/.exec(f);
    if (m) versions.push(m[1].padStart(3, "0"));
  }
  versions.sort((a, b) => Number(a) - Number(b));
  return versions;
}

// CLIs Go recentes (incl. supabase-cli) costumam renderizar tabelas com
// box-drawing Unicode (│ ─ ┼) em vez de ASCII puro (| -), inclusive em modo
// não-interativo/CI. Normalizamos para ASCII antes de aplicar as regras de
// parsing, para não depender de qual variante o CLI instalado usa.
function normalizeTableChars(line) {
  return line.replace(/[│┃┆┊╎╏]/g, "|").replace(/[─━┄┈╌]/g, "-");
}

/**
 * Formato real do `supabase migration list` (CLI 2.109, confirmado via
 * stdout bruto capturado no CI do PR #132 — cada valor de célula vem entre
 * crases simples:
 *
 *    Local            | Remote           | Time (UTC)
 *   ------------------|------------------|-----------------------
 *    `001`            | `001`            | `001`
 *    `205`            | ` `              | `205`
 *
 * O parser anterior esperava dígitos nus no início da linha
 * (`^(\d+)\s*\|...`) e nunca casava nenhuma linha real — daí "Nenhuma
 * linha de migration foi interpretada" mesmo com o CLI funcionando
 * corretamente. Remove as crases antes de aplicar a regra de extração.
 */
function stripBackticks(cell) {
  return cell.trim().replace(/^`|`$/g, "").trim();
}

function parseMigrationListTable(stdout) {
  const rows = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const trimmed = normalizeTableChars(rawLine.trim());
    if (!trimmed.includes("|")) continue;
    if (/^[-\s|┼┿╂╁╀+]+$/.test(trimmed)) continue;
    if (/^\s*local\s*\|/i.test(trimmed)) continue;

    const cells = trimmed.split("|").map(stripBackticks);
    if (cells.length < 2) continue;
    const [localCell, remoteCell] = cells;
    if (!/^\d+$/.test(localCell)) continue;
    const local = localCell.padStart(3, "0");
    const remoteRaw = remoteCell ?? "";
    const remote = remoteRaw === "" ? null : remoteRaw.padStart(3, "0");
    rows.push({ local, remote });
  }
  return rows;
}

function analyze(rows, diskVersions) {
  const drift = [];
  const fromCli = new Map();
  for (const r of rows) {
    fromCli.set(r.local, r.remote);
    if (r.remote === null || r.remote !== r.local) {
      drift.push({
        version: r.local,
        reason:
          r.remote === null
            ? "remote_ausente"
            : "local_remote_diferentes",
        remote: r.remote,
      });
    }
  }

  const missingInList = diskVersions.filter((v) => !fromCli.has(v));
  const extraInList = [...fromCli.keys()].filter((v) => !diskVersions.includes(v));

  const diskSet = new Set(diskVersions);
  const maxDisk = diskVersions.length ? diskVersions[diskVersions.length - 1] : null;

  return { drift, fromCli, missingInList, extraInList, maxDisk, diskSet };
}

function main() {
  const opts = readArgs(process.argv.slice(2));

  let stdout;
  let stderr = "";
  try {
    // Redireciona stderr→stdout: alguns CLIs Go (supabase-cli incluído, em
    // certas versões/terminais) escrevem a tabela de dados no stderr mesmo em
    // execução bem-sucedida, só usando stdout para JSON/máquina. Sem isso,
    // `execSync` descarta o stderr no caminho de sucesso e o parser via zero
    // linhas mesmo com o CLI funcionando corretamente.
    stdout = execSync("npx supabase migration list 2>&1", {
      cwd: BACKEND_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (e) {
    // Com `2>&1` no comando, o stderr do CLI já vem mesclado em e.stdout —
    // e.stderr tende a ficar vazio. Usa o que existir.
    stderr = (e.stdout?.toString?.() ?? String(e.stdout ?? "")) || (e.stderr?.toString?.() ?? String(e.stderr ?? ""));
    const hint =
      "Confira: pasta `backend`, `npx supabase link --project-ref <ref>` e login CLI.";
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: "supabase_cli_failed",
            message: String(e.message ?? e),
            stderr: stderr.trim(),
            hint,
          },
          null,
          2,
        ),
      );
    } else {
      console.error("Falha ao executar `npx supabase migration list`.\n");
      if (stderr.trim()) console.error(stderr.trim() + "\n");
      console.error(hint);
    }
    process.exit(2);
  }

  const diskVersions = listMigrationVersionsFromDisk();
  const rows = parseMigrationListTable(stdout);
  if (rows.length === 0) {
    const msg =
      "Nenhuma linha de migration foi interpretada. Atualize o parser se o formato do CLI mudou.";
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: "parse_empty", message: msg, rawStdout: stdout }, null, 2));
    } else {
      console.error(msg);
      console.error("\n--- stdout bruto de `npx supabase migration list` (para diagnóstico) ---");
      console.error(stdout);
      console.error("--- fim do stdout bruto ---\n");
    }
    process.exit(2);
  }

  const { drift, missingInList, extraInList, maxDisk } = analyze(rows, diskVersions);
  const aligned = drift.length === 0 && missingInList.length === 0 && extraInList.length === 0;

  const payload = {
    ok: aligned,
    backendRoot: BACKEND_ROOT,
    maxOnDisk: maxDisk,
    rowCount: rows.length,
    diskSqlCount: diskVersions.length,
    drift: drift.map((d) => ({
      version: d.version,
      reason: d.reason,
      remote: d.remote,
    })),
    missingInCliTable: missingInList,
    extraInCliTableNotOnDisk: extraInList,
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log("P0 — status de migrations (Local vs Remote)\n");
    console.log(`Pasta migrations: ${MIGRATIONS_DIR}`);
    console.log(`Arquivos .sql (prefixo numérico): ${diskVersions.length}`);
    console.log(`Linhas parseadas do CLI: ${rows.length}`);
    console.log(`Maior versão no disco: ${maxDisk ?? "(nenhuma)"}\n`);
    if (aligned) {
      console.log("Resultado: ALINHADO (Local = Remote para todas as linhas conhecidas).");
    } else {
      console.log("Resultado: DRIFT — ação sugerida: `npx supabase db push` no projeto linkado.\n");
      if (drift.length) {
        console.log("Versões com Remote ausente ou diferente de Local:");
        for (const d of drift) {
          console.log(`  - ${d.version} (${d.reason}${d.remote != null ? `; remote=${d.remote}` : ""})`);
        }
        console.log("");
      }
      if (missingInList.length) {
        console.log("Versões no disco que não apareceram na tabela do CLI:");
        console.log(`  ${missingInList.join(", ")}\n`);
      }
      if (extraInList.length) {
        console.log("Versões na tabela do CLI sem arquivo correspondente no disco:");
        console.log(`  ${extraInList.join(", ")}\n`);
      }
    }
  }

  if (!aligned && !opts.warnOnly) {
    process.exit(1);
  }
  process.exit(0);
}

main();
