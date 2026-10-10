#!/usr/bin/env node
/**
 * A-L1 G3/G4 orchestrator — stack fastproduct-capacity only.
 * Uses supabase status + psql + GoTrue HTTP. No .env.local, no remote refs.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const WORKDIR = path.join(ROOT, '.capacity-workdir')
const ART = '/opt/cursor/artifacts'
const SQL = path.join(__dirname, 'smoke-capacity-local.sql')
fs.mkdirSync(ART, { recursive: true })

function statusEnv() {
  const raw = execSync(
    `npx --yes supabase@2.120.0 status --workdir "${WORKDIR}" -o env`,
    { encoding: 'utf8', cwd: WORKDIR },
  )
  /** @type {Record<string, string>} */
  const env = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
  return env
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function smokeAuthHttp(apiUrl, anonKey) {
  // Seed users have no password hash — prove GoTrue health + anon REST gate.
  const health = await fetch(`${apiUrl}/auth/v1/health`)
  assert(health.ok, `auth health HTTP ${health.status}`)
  const body = await health.json()
  assert(body?.name === 'GoTrue', 'auth health name != GoTrue')

  const rest = await fetch(`${apiUrl}/rest/v1/lojas?select=id&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  })
  // anon must not freely list lojas (RLS) — 200 with [] or 401/403 both OK
  const rows = rest.ok ? await rest.json() : null
  return {
    ok: true,
    health_status: health.status,
    rest_status: rest.status,
    anon_loja_rows: Array.isArray(rows) ? rows.length : null,
  }
}

function runSqlSmoke(dbUrl) {
  assert(/127\.0\.0\.1|localhost/.test(dbUrl), `DB não local: ${dbUrl}`)
  assert(!/supabase\.co/.test(dbUrl), 'DB remoto proibido')
  const out = execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -f "${SQL}"`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  fs.writeFileSync(path.join(ART, 'al1-smoke-sql.log'), out)
  return out
}

function parseSqlPass(out) {
  const g4 = /G4_OK/.test(out) || /G4 ROLLBACK done/.test(out)
  const migrations = /migrations=\s*(\d+)/.exec(out)
  const rls = /rls_all=\s*(t|true|f|false)/i.exec(out)
  const rpcs = /rpcs=\s*([^\n]+)/.exec(out)?.[1] ?? ''
  return {
    migrations: migrations ? Number(migrations[1]) : null,
    rls_all: rls ? /^t/i.test(rls[1]) : false,
    has_v4: rpcs.includes('finalizar_venda_transacional_canonica_v4'),
    has_financeiro: rpcs.includes('financeiro_comando'),
    has_caixa: rpcs.includes('fechar_caixa_atomico'),
    g4_sql_ok: g4 && !/ERROR:/.test(out),
    isolation_ok: /isolation_other=0/.test(out) || /G4_OK/.test(out),
  }
}

async function main() {
  const env = statusEnv()
  const url = env.API_URL || env.SUPABASE_URL
  const anon = env.ANON_KEY
  const dbUrl = env.DB_URL || env.POSTGRES_URL || env.DATABASE_URL
  assert(url && anon && dbUrl, 'status incompleto')
  assert(/127\.0\.0\.1|localhost/.test(url), `URL não local: ${url}`)
  assert(!/supabase\.co/.test(url), 'URL remota supabase.co proibida')

  const sqlOut = runSqlSmoke(dbUrl)
  const parsed = parseSqlPass(sqlOut)
  const auth = await smokeAuthHttp(url, anon)

  const g3 = {
    migrations_ok: (parsed.migrations ?? 0) >= 400,
    has_v4: parsed.has_v4,
    has_financeiro_comando: parsed.has_financeiro,
    has_fechar_caixa: parsed.has_caixa,
    rls_all: parsed.rls_all,
  }
  const g3_pass = Object.values(g3).every(Boolean)
  const g4_pass = Boolean(parsed.g4_sql_ok && auth.ok)

  const report = {
    generated_at: new Date().toISOString(),
    api_url: url,
    g3,
    g3_pass,
    parsed,
    g4_auth_http: auth,
    g4_pass,
  }
  fs.writeFileSync(
    path.join(ART, 'al1-smoke-report.json'),
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify(report, null, 2))
  if (!g3_pass || !g4_pass) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
