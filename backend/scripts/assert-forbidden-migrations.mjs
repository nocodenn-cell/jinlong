#!/usr/bin/env node
/**
 * Guard permanente: migrations listadas em supabase/forbidden-migrations.json
 * não podem ser aplicadas pelos caminhos automatizados cobertos por este repo.
 *
 * Limite documentado: não impede `psql`/`apply_migration` manual fora do CI —
 * apenas falha nos scripts/guards versionados.
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
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'supabase', 'migrations')

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
  const seen = new Set()
  return payload.entries.map((entry, index) => {
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
}

export function assertForbiddenFileMarked(migrationsDir, entry) {
  const abs = path.join(migrationsDir, entry.file)
  if (!fs.existsSync(abs)) {
    throw new Error(`FORBIDDEN_APPLY: arquivo ausente ${entry.file} (não apagar — só bloquear apply)`)
  }
  const head = fs.readFileSync(abs, 'utf8').slice(0, 4000)
  if (!FORBIDDEN_HEADER_RE.test(head)) {
    throw new Error(
      `FORBIDDEN_APPLY: ${entry.file} deve conter comentário "-- FORBIDDEN_APPLY" no cabeçalho`,
    )
  }
  return true
}

/**
 * Simula um pedido de apply automatizado: se a versão estiver na deny-list, falha.
 * Usado por testes e por wrappers de apply controlados.
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
  migrationsDir = MIGRATIONS_DIR,
} = {}) {
  const entries = loadForbiddenRegistry(registryRaw)
  for (const entry of entries) {
    assertForbiddenFileMarked(migrationsDir, entry)
  }
  // Auto-check: pedir apply da própria deny-list deve falhar.
  try {
    assertNotInAutomatedApplyList(
      entries.map((e) => e.version),
      entries,
    )
    throw new Error('FORBIDDEN_APPLY: deny-list não rejeitou apply simulado (bug no guard)')
  } catch (err) {
    if (!String(err.message).includes('apply automatizado bloqueado')) throw err
  }
  return { ok: true, count: entries.length, versions: entries.map((e) => e.version) }
}

function main(argv = process.argv.slice(2)) {
  const asJson = argv.includes('--json')
  const result = runAssertForbiddenMigrations()
  if (asJson) {
    console.log(JSON.stringify(result))
  } else {
    console.log(`assert-forbidden-migrations: PASS (${result.count} proibida(s))`)
    for (const v of result.versions) console.log(`  - ${v}`)
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    main()
  } catch (err) {
    console.error(String(err?.message || err))
    process.exit(1)
  }
}
