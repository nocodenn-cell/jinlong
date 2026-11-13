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

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, "supabase", "migrations");
const HUMAN_GATES_FILE = path.join(BACKEND_ROOT, "supabase", "migration-human-gates.json");
/** Migrations adiadas pela governança de deploy (docs/ops/deploy-governance.md). */
const DEFERRED_MANIFEST_FILE = path.join(BACKEND_ROOT, "..", ".github", "deploy-governance", "deferred-migrations.json");

function readArgs(argv) {
  return {
    json: argv.includes("--json"),
    warnOnly: argv.includes("--warn-only"),
  };
}

/** Chaves numéricas legadas no repo; remoto usa timestamps equivalentes (reconciliação Fase 1 / SSOT). */
function isLegacyNumericMirrorDrift(entry) {
  if (entry.reason !== "remote_ausente") return false;
  const raw = entry.version.replace(/^0+/, "") || entry.version;
  if (/^\d{1,3}$/.test(raw)) {
    const n = Number(raw);
    return n >= 205 && n <= 289;
  }
  if (/^2470[1-3]$/.test(raw)) {
    return true;
  }
  return false;
}

/** Reordenação greenfield SSOT: numerics legados movidos para timestamps (antes dos backports 202608*). */
function isGreenfieldSsotReorderDrift(entry) {
  if (entry.reason !== "remote_ausente") return false;
  const n = Number(entry.version);
  if (!Number.isFinite(n)) return false;
  // ex-205..269 (+24703) → 20260621000100..20260621005700
  if (n >= 20260621000100 && n <= 20260621005700) {
    return (n - 20260621000100) % 100 === 0;
  }
  // ex-24701/24702/268 → após 264 (cadeia RETURNS da v4)
  if (n === 20260710212310 || n === 20260710212320 || n === 20260710212330) {
    return true;
  }
  // ex-270..289 → 20260731200300..20260731202200
  if (n >= 20260731200300 && n <= 20260731202200) {
    return (n - 20260731200300) % 100 === 0;
  }
  return false;
}

function isLegacyRemoteOnlyNumeric(version) {
  const raw = String(version).replace(/^0+/, "") || version;
  if (/^2470[1-3]$/.test(raw)) return true;
  if (!/^\d{1,3}$/.test(raw)) return false;
  const n = Number(raw);
  return n >= 205 && n <= 289;
}

export function classifyDriftEntries(drift) {
  const blocking = [];
  const legacyNumericMirror = [];
  const greenfieldSsotReorder = [];
  for (const d of drift) {
    if (isGreenfieldSsotReorderDrift(d)) {
      greenfieldSsotReorder.push(d);
    } else if (isLegacyNumericMirrorDrift(d)) {
      legacyNumericMirror.push(d);
    } else {
      blocking.push(d);
    }
  }
  return { blocking, legacyNumericMirror, greenfieldSsotReorder };
}

/**
 * Schema por PAR (não por entrada solta git_only/remote_only): cada
 * reconciliação de "aplicado via MCP apply_migration" é um único par
 * {gitOnlyVersion, remoteOnlyVersion}. Isso é o que permite aceitação
 * ATÔMICA — ver `applyHumanGateRegistry` — em vez de cada lado ser
 * silenciado independentemente. Uma entrada solta git_only aceitando o
 * drift sozinha (schema antigo) escondia o caso real reportado em review:
 * se um ambiente (ex.: staging) nunca recebeu a migration em NENHUM
 * formato, só o lado git_only aparece como drift ali, e o schema antigo
 * aceitava mesmo assim — mascarando uma correção financeira genuinamente
 * ausente naquele ambiente como se fosse a mesma reconciliação já
 * conhecida da produção.
 */
export function parseHumanGateRegistry(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("Registro HUMAN_GATE inválido: JSON malformado.");
  }
  if (!payload || !Array.isArray(payload.pairs)) {
    throw new Error("Registro HUMAN_GATE inválido: campo pairs deve ser uma lista.");
  }
  const seen = new Set();
  return payload.pairs.map((pair, index) => {
    if (!pair || typeof pair !== "object") {
      throw new Error(`Registro HUMAN_GATE inválido: pairs[${index}] não é objeto.`);
    }
    const gitOnlyVersion = String(pair.gitOnlyVersion ?? "").trim();
    const remoteOnlyVersion = String(pair.remoteOnlyVersion ?? "").trim();
    const reason = String(pair.reason ?? "").trim();
    const decisionDoc = String(pair.decisionDoc ?? "").trim();
    if (!/^\d+$/.test(gitOnlyVersion)) {
      throw new Error(`Registro HUMAN_GATE inválido: pairs[${index}].gitOnlyVersion deve ser numérica.`);
    }
    if (!/^\d+$/.test(remoteOnlyVersion)) {
      throw new Error(`Registro HUMAN_GATE inválido: pairs[${index}].remoteOnlyVersion deve ser numérica.`);
    }
    if (!reason || !decisionDoc) {
      throw new Error(`Registro HUMAN_GATE inválido: pairs[${index}] exige reason e decisionDoc.`);
    }
    const key = `${gitOnlyVersion}<->${remoteOnlyVersion}`;
    if (seen.has(key)) {
      throw new Error(`Registro HUMAN_GATE inválido: par duplicado ${key}.`);
    }
    seen.add(key);
    return { gitOnlyVersion, remoteOnlyVersion, reason, decisionDoc };
  });
}

function loadHumanGateRegistry() {
  if (!fs.existsSync(HUMAN_GATES_FILE)) {
    throw new Error(`Registro HUMAN_GATE obrigatório ausente: ${HUMAN_GATES_FILE}`);
  }
  return parseHumanGateRegistry(fs.readFileSync(HUMAN_GATES_FILE, "utf8"));
}

export function applyHumanGateRegistry({ blocking, missingInList, extraBlocking }, pairs, alignedVersions = []) {
  // Versões cujo arquivo local já consta no remoto com a MESMA version (local = remote).
  const alignedSet = new Set(alignedVersions);
  const blockingByVersion = new Map(blocking.map((entry) => [entry.version, entry]));
  const missingSet = new Set(missingInList);
  const extraSet = new Set(extraBlocking);

  const acceptedGitOnly = new Set();
  const acceptedRemoteOnly = new Set();
  const humanGate = [];

  for (const pair of pairs) {
    const gitEntry = blockingByVersion.get(pair.gitOnlyVersion);
    const gitPresent = Boolean(gitEntry) || missingSet.has(pair.gitOnlyVersion);
    const gitAligned = !gitPresent && alignedSet.has(pair.gitOnlyVersion);
    const remotePresent = extraSet.has(pair.remoteOnlyVersion);

    // Git ALINHADO + lado remote_only ainda presente: a migration foi registrada de novo com a version do arquivo
    // (ex.: reconciliação) e a linha antiga com timestamp MCP ficou como duplicata. É prova AINDA MAIS forte de que
    // foi aplicada neste ambiente, então a duplicata é justificada pelo par — não é remote-only órfão.
    if (gitAligned && remotePresent) {
      acceptedRemoteOnly.add(pair.remoteOnlyVersion);
      humanGate.push({
        version: pair.remoteOnlyVersion,
        direction: "remote_only",
        reason: pair.reason,
        decisionDoc: pair.decisionDoc,
        divergence: "duplicata_git_alinhado",
      });
      continue;
    }

    // ATÔMICO: só aceita o par quando os DOIS lados aparecem como
    // divergência no ambiente atual sendo avaliado. Um ambiente onde a
    // migration nunca foi aplicada em nenhum formato só mostra o lado
    // git_only (arquivo local sem correspondente remoto) — sem o lado
    // remote_only confirmando que a versão MCP existe ali, aceitar mesmo
    // assim equivaleria a dizer "aplicado" sobre um ambiente onde não foi.
    if (!gitPresent || !remotePresent) continue;

    acceptedGitOnly.add(pair.gitOnlyVersion);
    acceptedRemoteOnly.add(pair.remoteOnlyVersion);
    const gitDivergence = gitEntry ? gitEntry.reason : "ausente_na_lista_cli";
    humanGate.push({
      version: pair.gitOnlyVersion,
      direction: "git_only",
      reason: pair.reason,
      decisionDoc: pair.decisionDoc,
      divergence: gitDivergence,
    });
    humanGate.push({
      version: pair.remoteOnlyVersion,
      direction: "remote_only",
      reason: pair.reason,
      decisionDoc: pair.decisionDoc,
      divergence: "remote_only",
    });
  }

  const blockingRemaining = blocking.filter((entry) => !acceptedGitOnly.has(entry.version));
  const missingRemaining = missingInList.filter((version) => !acceptedGitOnly.has(version));
  const extraRemaining = extraBlocking.filter((version) => !acceptedRemoteOnly.has(version));

  return {
    blocking: blockingRemaining,
    missingInList: missingRemaining,
    extraBlocking: extraRemaining,
    humanGate,
  };
}

/**
 * Migrations novas do próprio PR (arquivo ausente na base do PR) ainda não
 * podem estar no projeto de verificação: elas só são aplicadas depois do
 * merge. Sem esta separação, todo PR que adiciona migration falha até alguém
 * aplicá-la no remoto antes da revisão — e uma única migration da main não
 * aplicada passa a reprovar todos os PRs seguintes (o que ocorreu a partir de
 * 20261006120000). Só `remote_ausente` é elegível: remote-only, versões
 * divergentes e migrations que JÁ estão na base continuam bloqueando.
 * `baseVersions === null` (sem ref de base, ex.: workflow_dispatch) mantém o
 * comportamento estrito.
 */
export function separatePrPendingMigrations({ blocking, missingInList }, baseVersions) {
  if (!baseVersions) return { blocking, missingInList, prPending: [] };
  const base = new Set(baseVersions);
  const prPending = [];
  const keptBlocking = [];
  for (const entry of blocking) {
    if (entry.reason === "remote_ausente" && !base.has(entry.version)) prPending.push(entry.version);
    else keptBlocking.push(entry);
  }
  const keptMissing = [];
  for (const version of missingInList) {
    if (base.has(version)) keptMissing.push(version);
    else if (!prPending.includes(version)) prPending.push(version);
  }
  prPending.sort((a, b) => Number(a) - Number(b));
  return { blocking: keptBlocking, missingInList: keptMissing, prPending };
}

/**
 * Manifesto de migrations ADIADAS (`.github/deploy-governance/deferred-migrations.json`): decisão de governança
 * de NÃO aplicar ainda uma migration que já está na main. Fail-closed: JSON malformado ou versão inválida aborta.
 */
export function parseDeferredManifest(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Manifesto de migrations adiadas inválido (JSON): ${String(error.message ?? error)}`);
  }
  if (!parsed || !Array.isArray(parsed.deferred)) {
    throw new Error("Manifesto de migrations adiadas inválido: campo `deferred` (array) ausente.");
  }
  return parsed.deferred.map((entry, i) => {
    const version = String(entry?.version ?? "").trim();
    if (!/^\d+$/.test(version)) throw new Error(`Manifesto de migrations adiadas: deferred[${i}].version inválida.`);
    return version.padStart(3, "0");
  });
}

/** Sem manifesto = nenhuma adiada (comportamento estrito). */
function loadDeferredVersions() {
  if (!fs.existsSync(DEFERRED_MANIFEST_FILE)) return [];
  return parseDeferredManifest(fs.readFileSync(DEFERRED_MANIFEST_FILE, "utf8"));
}

/**
 * Migrations adiadas pela governança ficam de fora do remoto DE PROPÓSITO: `remote_ausente` (ou ausência na tabela
 * do CLI) delas não bloqueia e é listado à parte. O inverso é violação de governança e BLOQUEIA: uma adiada que
 * aparece aplicada no remoto (`adiada_aplicada`).
 */
export function separateDeferredMigrations({ blocking, missingInList }, rows, deferredVersions) {
  const deferred = new Set(deferredVersions ?? []);
  if (deferred.size === 0) return { blocking, missingInList, deferredPending: [], deferredApplied: [] };
  const deferredPending = [];
  const keptBlocking = [];
  for (const entry of blocking) {
    if (entry.reason === "remote_ausente" && deferred.has(entry.version)) deferredPending.push(entry.version);
    else keptBlocking.push(entry);
  }
  const keptMissing = [];
  for (const version of missingInList) {
    if (deferred.has(version)) {
      if (!deferredPending.includes(version)) deferredPending.push(version);
    } else keptMissing.push(version);
  }
  const deferredApplied = [...new Set((rows ?? []).map((r) => r.remote).filter((v) => v && deferred.has(v)))];
  for (const version of deferredApplied) {
    keptBlocking.push({ version, reason: "adiada_aplicada", remote: version });
  }
  deferredPending.sort((a, b) => Number(a) - Number(b));
  return { blocking: keptBlocking, missingInList: keptMissing, deferredPending, deferredApplied };
}

/** Versões de migration presentes no ref git de base (ex.: origin/main). Fail-closed. */
function listBaseMigrationVersions(ref) {
  const out = execFileSync("git", ["ls-tree", "--name-only", "--full-name", ref, "--", "supabase/migrations/"], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const versions = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /\/(\d+)_[^/]*\.sql$/.exec(line.trim());
    if (m) versions.push(m[1].padStart(3, "0"));
  }
  if (versions.length === 0) {
    throw new Error(`Nenhuma migration encontrada em ${ref}:backend/supabase/migrations.`);
  }
  return versions;
}

export function deriveOverallStatus({
  blocking,
  humanGate = [],
  deferred = [],
  missingInList,
  extraBlocking,
}) {
  if (blocking.length > 0 || missingInList.length > 0 || extraBlocking.length > 0) {
    return "BLOCKING_DRIFT";
  }
  if (humanGate.length > 0 || deferred.length > 0) return "HUMAN_GATE";
  return "ALIGNED";
}

export function deriveExitCode(status, warnOnly = false) {
  // HUMAN_GATE não bloqueia CI: a decisão humana já foi tomada e revisada no
  // PR que adicionou a entrada em migration-human-gates.json (reason +
  // decisionDoc obrigatórios, validados por parseHumanGateRegistry). Exigir
  // um override manual a cada execução do gate seria fricção redundante —
  // a aprovação já aconteceu no code review daquele registro.
  if (status === "BLOCKING_DRIFT" && !warnOnly) return 1;
  return 0;
}

/**
 * Motivos de INTEGRIDADE: violações que nunca viram informativas, nem com --warn-only.
 * `adiada_aplicada`: uma migration que a governança adiou apareceu aplicada no remoto.
 */
export const INTEGRITY_REASONS = new Set(["adiada_aplicada"]);

export function hasIntegrityViolation(blocking) {
  return (blocking ?? []).some((entry) => INTEGRITY_REASONS.has(entry?.reason));
}

/**
 * Código de saída final. Integridade bloqueia sempre. Divergências comuns seguem `deriveExitCode`
 * (com --warn-only, viram informativas).
 */
export function resolveExitCode({ status, warnOnly = false, blocking = [] }) {
  if (hasIntegrityViolation(blocking)) return 1;
  return deriveExitCode(status, warnOnly);
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

export function parseMigrationListTable(stdout) {
  const rows = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const trimmed = normalizeTableChars(rawLine.trim());
    if (!trimmed.includes("|")) continue;
    if (/^[-\s|┼┿╂╁╀+]+$/.test(trimmed)) continue;
    if (/^\s*local\s*\|/i.test(trimmed)) continue;

    const cells = trimmed.split("|").map(stripBackticks);
    if (cells.length < 2) continue;
    const [localCell, remoteCell] = cells;
    if (localCell !== "" && !/^\d+$/.test(localCell)) continue;
    if (remoteCell !== "" && !/^\d+$/.test(remoteCell)) continue;
    if (localCell === "" && remoteCell === "") continue;
    const local = localCell === "" ? null : localCell.padStart(3, "0");
    const remote = remoteCell === "" ? null : remoteCell.padStart(3, "0");
    rows.push({ local, remote });
  }
  return rows;
}

function parseMigrationListJson(stdout) {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart < 0) return null;

  // CLIs desatualizados imprimem o aviso "A new version ... is available" DEPOIS do JSON.
  const jsonEnd = stdout.lastIndexOf("}");
  let payload;
  try {
    payload = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }
  if (!payload || !Array.isArray(payload.migrations)) return null;

  const rows = payload.migrations.map((migration, index) => {
    if (!migration || typeof migration !== "object") {
      throw new Error(`JSON inválido: migrations[${index}] não é objeto.`);
    }
    const localRaw = String(migration.local ?? "").trim();
    const remoteRaw = String(migration.remote ?? "").trim();
    if (localRaw !== "" && !/^\d+$/.test(localRaw)) {
      throw new Error(`JSON inválido: migrations[${index}].local não é numérico.`);
    }
    if (remoteRaw !== "" && !/^\d+$/.test(remoteRaw)) {
      throw new Error(`JSON inválido: migrations[${index}].remote não é numérico.`);
    }
    if (localRaw === "" && remoteRaw === "") {
      throw new Error(`JSON inválido: migrations[${index}] não possui versão local nem remota.`);
    }
    return {
      local: localRaw === "" ? null : localRaw.padStart(3, "0"),
      remote: remoteRaw === "" ? null : remoteRaw.padStart(3, "0"),
    };
  });
  return rows;
}

export function parseMigrationListOutput(stdout) {
  const jsonRows = parseMigrationListJson(stdout);
  if (jsonRows !== null) return { format: "json", rows: jsonRows };

  const tableRows = parseMigrationListTable(stdout);
  if (tableRows.length > 0) return { format: "legacy_table", rows: tableRows };

  throw new Error(
    "Nenhuma migration foi interpretada como JSON atual ou tabela legada do Supabase CLI.",
  );
}

export function analyze(rows, diskVersions) {
  const drift = [];
  const fromCli = new Map();
  const remoteOnly = new Set();
  for (const r of rows) {
    if (r.local === null) {
      remoteOnly.add(r.remote);
      continue;
    }
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
  const extraInList = [
    ...remoteOnly,
    ...[...fromCli.keys()].filter((v) => !diskVersions.includes(v)),
  ];

  const diskSet = new Set(diskVersions);
  const maxDisk = diskVersions.length ? diskVersions[diskVersions.length - 1] : null;

  return { drift, fromCli, missingInList, extraInList, maxDisk, diskSet };
}

function runMigrationListWithRetry(maxAttempts) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return execSync("npx supabase@2.121.0 migration list --linked 2>&1", {
        cwd: BACKEND_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (e) {
      lastErr = e;
      const merged =
        (e.stdout?.toString?.() ?? String(e.stdout ?? "")) ||
        (e.stderr?.toString?.() ?? String(e.stderr ?? ""));
      const transient =
        /auth_query secret check timed out|failed to connect to postgres|connection reset/i.test(
          merged,
        );
      if (!transient || attempt === maxAttempts) {
        throw e;
      }
      const waitMs = attempt * 8000;
      console.warn(
        `migration list tentativa ${attempt}/${maxAttempts} falhou (transiente); aguardando ${waitMs}ms…`,
      );
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
  }
  throw lastErr;
}

function main() {
  const opts = readArgs(process.argv.slice(2));

  let stdout;
  let stderr = "";
  try {
    stdout = runMigrationListWithRetry(3);
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
  let parsed;
  try {
    parsed = parseMigrationListOutput(stdout);
  } catch (error) {
    const msg = String(error.message ?? error);
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: "parse_failed", message: msg, rawStdout: stdout }, null, 2));
    } else {
      console.error(msg);
      console.error("\n--- stdout bruto de `npx supabase migration list` (para diagnóstico) ---");
      console.error(stdout);
      console.error("--- fim do stdout bruto ---\n");
    }
    process.exit(2);
  }
  const { format: cliOutputFormat, rows } = parsed;

  const { drift, missingInList, extraInList, maxDisk } = analyze(rows, diskVersions);
  const { blocking: initiallyBlocking, legacyNumericMirror, greenfieldSsotReorder } =
    classifyDriftEntries(drift);
  const extraLegacyRemote = extraInList.filter(isLegacyRemoteOnlyNumeric);
  const initiallyExtraBlocking = extraInList.filter((v) => !isLegacyRemoteOnlyNumeric(v));
  let gates;
  try {
    gates = loadHumanGateRegistry();
  } catch (error) {
    const message = String(error.message ?? error);
    if (opts.json) console.log(JSON.stringify({ ok: false, error: "human_gate_registry_invalid", message }, null, 2));
    else console.error(message);
    process.exit(2);
  }
  const {
    blocking: gatedBlocking,
    missingInList: gatedMissingInList,
    extraBlocking,
    humanGate,
  } = applyHumanGateRegistry(
    { blocking: initiallyBlocking, missingInList, extraBlocking: initiallyExtraBlocking },
    gates,
    rows.filter((r) => r.local !== null && r.local === r.remote).map((r) => r.local),
  );
  let deferredVersions;
  try {
    deferredVersions = loadDeferredVersions();
  } catch (error) {
    const message = String(error.message ?? error);
    if (opts.json) console.log(JSON.stringify({ ok: false, error: "deferred_manifest_invalid", message }, null, 2));
    else console.error(message);
    process.exit(2);
  }
  const {
    blocking: deferredFilteredBlocking,
    missingInList: deferredFilteredMissing,
    deferredPending,
    deferredApplied,
  } = separateDeferredMigrations(
    { blocking: gatedBlocking, missingInList: gatedMissingInList },
    rows,
    deferredVersions,
  );
  const baseRef = (process.env.MIGRATION_DRIFT_BASE_REF ?? "").trim();
  let baseVersions = null;
  if (baseRef) {
    try {
      baseVersions = listBaseMigrationVersions(baseRef);
    } catch (error) {
      const message = `Falha ao ler migrations do ref de base ${baseRef}: ${String(error.message ?? error)}`;
      if (opts.json) console.log(JSON.stringify({ ok: false, error: "base_ref_failed", message }, null, 2));
      else console.error(message);
      process.exit(2);
    }
  }
  const {
    blocking,
    missingInList: blockingMissingInList,
    prPending,
  } = separatePrPendingMigrations(
    { blocking: deferredFilteredBlocking, missingInList: deferredFilteredMissing },
    baseVersions,
  );
  const status = deriveOverallStatus({
    blocking,
    humanGate,
    deferred: deferredPending,
    missingInList: blockingMissingInList,
    extraBlocking,
  });
  const aligned = status === "ALIGNED";

  const payload = {
    ok: aligned,
    status,
    backendRoot: BACKEND_ROOT,
    maxOnDisk: maxDisk,
    rowCount: rows.length,
    cliOutputFormat,
    diskSqlCount: diskVersions.length,
    drift: drift.map((d) => ({
      version: d.version,
      reason: d.reason,
      remote: d.remote,
    })),
    driftBlocking: blocking.map((d) => ({
      version: d.version,
      reason: d.reason,
      remote: d.remote,
    })),
    humanGates: humanGate,
    deferredByGovernance: deferredPending,
    deferredAppliedViolation: deferredApplied,
    baseRef: baseRef || null,
    prPendingNotOnBase: prPending,
    driftLegacyNumericMirror: legacyNumericMirror.map((d) => ({
      version: d.version,
      reason: d.reason,
      note: "Espelho numérico no repo; remoto registra timestamp equivalente (reconciliação SSOT)",
    })),
    driftGreenfieldSsotReorder: greenfieldSsotReorder.map((d) => ({
      version: d.version,
      reason: d.reason,
      note: "Reordenação greenfield 270–289 → timestamps; remoto pode registrar chave numérica legada",
    })),
    extraLegacyRemoteOnlyNumeric: extraLegacyRemote,
    missingInCliTable: missingInList,
    blockingMissingInCliTable: blockingMissingInList,
    extraInCliTableNotOnDisk: extraInList,
    extraBlockingRemoteOnly: extraBlocking,
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log("P0 — status de migrations (Local vs Remote)\n");
    console.log(`Pasta migrations: ${MIGRATIONS_DIR}`);
    console.log(`Arquivos .sql (prefixo numérico): ${diskVersions.length}`);
    console.log(`Linhas parseadas do CLI: ${rows.length}`);
    console.log(`Maior versão no disco: ${maxDisk ?? "(nenhuma)"}\n`);
    if (status === "ALIGNED") {
      console.log("Resultado: ALINHADO (Local = Remote para todas as linhas bloqueantes).");
    } else if (status === "HUMAN_GATE") {
      console.log("Resultado: HUMAN GATE — divergência intencional exige decisão humana explícita.\n");
    } else {
      console.log("Resultado: DRIFT BLOQUEANTE — ação sugerida: revisar migrations / projeto linkado.\n");
    }
    if (humanGate.length) {
      console.log("Divergências sob decisão humana:");
      for (const gate of humanGate) {
        console.log(`  - ${gate.version} (${gate.direction}; ${gate.reason}; doc=${gate.decisionDoc})`);
      }
      console.log("");
    }
    if (deferredPending.length) {
      console.log("Adiadas pela governança (deferred-migrations.json; fora do remoto de propósito; não bloqueia):");
      console.log(`  ${deferredPending.join(", ")}\n`);
    }
    if (prPending.length) {
      console.log(`Migrations novas deste PR (ausentes em ${baseRef}; aplicar no remoto após o merge; não bloqueia):`);
      console.log(`  ${prPending.join(", ")}\n`);
    }
    if (legacyNumericMirror.length) {
      console.log("Espelhos numéricos 205–289 (reconciliação SSOT; não bloqueia o gate):");
      console.log(`  ${legacyNumericMirror.length} versões com remote_ausente\n`);
    }
    if (blocking.length) {
      console.log("Drift bloqueante:");
      for (const d of blocking) {
        console.log(
          `  - ${d.version} (${d.reason}${d.remote != null ? `; remote=${d.remote}` : ""})`,
        );
      }
      console.log("");
    }
    if (!blocking.length && drift.length) {
      console.log("(Nenhum drift bloqueante; ver categorias informativas acima.)\n");
    }
    if (extraBlocking.length) {
      console.log("Drift bloqueante — versões só no remoto sem par HUMAN_GATE completo:");
      console.log(`  ${extraBlocking.join(", ")}
`);
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

  const exitCode = resolveExitCode({ status, warnOnly: opts.warnOnly, blocking });
  if (status === "BLOCKING_DRIFT" && exitCode === 0) {
    console.log(
      "MODO INFORMATIVO (--warn-only): divergência de migrations registrada acima e NÃO bloqueia este job. " +
        "Ela continua visível nos logs. Integridade (adiada_aplicada) continua bloqueando.",
    );
  }
  process.exit(exitCode);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
