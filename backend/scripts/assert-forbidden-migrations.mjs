#!/usr/bin/env node
/**
 * Guard permanente: migrations listadas em supabase/forbidden-migrations.json
 * devem residir em quarantine (fora de supabase/migrations/) e não podem
 * reaparecer no diretório que o Supabase CLI aplica (db reset / db push).
 *
 * Limite: não impede `psql`/`apply_migration` MCP manual com SQL colado —
 * apenas falha nos scripts/guards versionados e no apply path do CLI.
 *
 * Uso:
 *   node scripts/assert-forbidden-migrations.mjs
 *   node scripts/assert-forbidden-migrations.mjs --json
 *   node --test scripts/assert-forbidden-migrations.test.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(__dirname, '..')
const FORBIDDEN_FILE = path.join(BACKEND_ROOT, 'supabase', 'forbidden-migrations.json')
const APPLY_DIR = path.join(BACKEND_ROOT, 'supabase', 'migrations')
const DEFAULT_QUARANTINE = 'migrations-forbidden'

const FORBIDDEN_HEADER_RE = /--\s*FORBIDDEN_APPLY\b/

export function loadForbiddenRegistry(raw) {
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new Error('forbidden-migrations.json: JSON malformado')
  }
  if (!payload || !Array.isArray(payload.entries) || payload.entries.length < 1) {
    throw new Error('forbidden-migrations.json: entries[] obrigatório e não-vazio')
  }
  const quarantineDir = String(payload.quarantineDir ?? DEFAULT_QUARANTINE).trim()
  if (!quarantineDir || quarantineDir.includes('..') || path.isAbsolute(quarantineDir)) {
    throw new Error('forbidden-migrations.json: quarantineDir inválido')
  }
  if (quarantineDir === 'migrations') {
    throw new Error('forbidden-migrations.json: quarantineDir não pode ser migrations/')
  }
  const seen = new Set()
  const entries = payload.entries.map((entry, index) => {
    const version = String(entry?.version ?? '').trim()
    const file = String(entry?.file ?? '').trim()
    const reason = String(entry?.reason ?? '').trim()
    const decisionDoc = String(entry?.decisionDoc ?? '').trim()
    if (!/^\d{14}$/.test(version)) {
      throw new Error(`forbidden-migrations entries[${index}]: version deve ter 14 dígitos`)
    }
    if (!file.startsWith(version) || !file.endsWith('.sql')) {
      throw new Error(`forbidden-migrations entries[${index}]: file deve começar com version e terminar .sql`)
    }
    if (!reason || !decisionDoc) {
      throw new Error(`forbidden-migrations entries[${index}]: reason e decisionDoc obrigatórios`)
    }
    if (seen.has(version)) {
      throw new Error(`forbidden-migrations: version duplicada ${version}`)
    }
    seen.add(version)
    return {
      version,
      file,
      reason,
      decisionDoc,
      supersededBy: entry.supersededBy ? String(entry.supersededBy) : null,
    }
  })
  return { quarantineDir, entries }
}

export function assertForbiddenFileMarked(quarantineAbs, entry) {
  const abs = path.join(quarantineAbs, entry.file)
  if (!fs.existsSync(abs)) {
    throw new Error(
      `FORBIDDEN_APPLY: arquivo ausente em quarantine ${entry.file} (preservar histórico; não apagar)`,
    )
  }
  const head = fs.readFileSync(abs, 'utf8').slice(0, 4000)
  if (!FORBIDDEN_HEADER_RE.test(head)) {
    throw new Error(
      `FORBIDDEN_APPLY: ${entry.file} deve conter comentário "-- FORBIDDEN_APPLY" no cabeçalho`,
    )
  }
  return true
}

/** Falha se qualquer versão proibida ainda existir no dir de apply do CLI. */
export function assertNotInApplyDirectory(applyDir, forbiddenEntries) {
  if (!fs.existsSync(applyDir)) return true
  const files = fs.readdirSync(applyDir).filter((f) => f.endsWith('.sql'))
  const hits = []
  for (const entry of forbiddenEntries) {
    const found = files.filter((f) => f.startsWith(`${entry.version}_`) || f === entry.file)
    for (const f of found) hits.push(`${entry.version} → migrations/${f}`)
  }
  if (hits.length > 0) {
    throw new Error(
      `FORBIDDEN_APPLY: SQL proibido ainda em supabase/migrations/ (CLI aplicaria):\n  ${hits.join('\n  ')}\n` +
        'Mova para supabase/migrations-forbidden/ e mantenha o registry.',
    )
  }
  return true
}

/**
 * Simula um pedido de apply automatizado: se a versão estiver na deny-list, falha.
 */
export function assertNotInAutomatedApplyList(versions, forbiddenEntries) {
  const deny = new Set(forbiddenEntries.map((e) => e.version))
  const hits = [...new Set(versions.map(String))].filter((v) => deny.has(v))
  if (hits.length > 0) {
    const detail = hits
      .map((v) => {
        const e = forbiddenEntries.find((x) => x.version === v)
        return `${v} — ${e?.reason ?? 'proibida'}`
      })
      .join('\n  ')
    throw new Error(
      `FORBIDDEN_APPLY: apply automatizado bloqueado para:\n  ${detail}\n` +
        'Remova a versão da lista de apply ou peça decisão humana explícita (não é GO).',
    )
  }
  return true
}

export function runAssertForbiddenMigrations({
  registryRaw = fs.readFileSync(FORBIDDEN_FILE, 'utf8'),
  applyDir = APPLY_DIR,
  backendRoot = BACKEND_ROOT,
} = {}) {
  const { quarantineDir, entries } = loadForbiddenRegistry(registryRaw)
  const quarantineAbs = path.join(backendRoot, 'supabase', quarantineDir)
  if (!fs.existsSync(quarantineAbs)) {
    throw new Error(`FORBIDDEN_APPLY: quarantine ausente: supabase/${quarantineDir}`)
  }
  for (const entry of entries) {
    assertForbiddenFileMarked(quarantineAbs, entry)
  }
  assertNotInApplyDirectory(applyDir, entries)
  try {
    assertNotInAutomatedApplyList(
      entries.map((e) => e.version),
      entries,
    )
    throw new Error('FORBIDDEN_APPLY: deny-list não rejeitou apply simulado (bug no guard)')
  } catch (err) {
    if (!String(err.message).includes('apply automatizado bloqueado')) throw err
  }
  return {
    ok: true,
    count: entries.length,
    versions: entries.map((e) => e.version),
    quarantineDir,
  }
}

function main(argv = process.argv.slice(2)) {
  const asJson = argv.includes('--json')
  const result = runAssertForbiddenMigrations()
  if (asJson) {
    console.log(JSON.stringify(result))
  } else {
    console.log(
      `assert-forbidden-migrations: PASS (${result.count} proibida(s); quarantine=${result.quarantineDir})`,
    )
    for (const v of result.versions) console.log(`  - ${v}`)
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    main()
  } catch (err) {
    console.error(String(err?.message || err))
    process.exit(1)
  }
}
