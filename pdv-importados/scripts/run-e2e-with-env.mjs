/**
 * Carrega `.env.local` no process.env (sem sobrescrever vars já definidas)
 * e executa Playwright com os args restantes.
 * Uso: node scripts/run-e2e-with-env.mjs playwright test e2e/...
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env.local')

function loadEnvLocal() {
  if (!fs.existsSync(envPath)) {
    console.error('MISSING .env.local')
    process.exit(1)
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

loadEnvLocal()

// Guard de ambiente (go-live): mesmo padrão de backend/scripts/fallback-sem-rpc-real.mjs.
// O projeto Supabase é único (produção = Preview = E2E); .env.local apontado para ele
// faria o E2E gravar em produção. Override consciente: ALLOW_NONLOCAL_E2E=1.
const ALVO_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/
if (process.env.ALLOW_NONLOCAL_E2E !== '1') {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
  if (!ALVO_LOCAL.test(supabaseUrl)) {
    console.error(
      `RECUSADO: o alvo do E2E não é local (NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl || '<vazio>'}). ` +
        'O E2E não pode rodar contra produção: só roda em localhost/127.0.0.1. ' +
        'Override consciente: ALLOW_NONLOCAL_E2E=1.',
    )
    process.exit(2)
  }
}
const need = ['PLAYWRIGHT_CAIXA_TEST_EMAIL', 'PLAYWRIGHT_CAIXA_TEST_PASSWORD']
for (const k of need) {
  if (!process.env[k]?.trim()) {
    console.error(`MISSING ${k}`)
    process.exit(2)
  }
}
console.log(`env_ok keys=${need.join(',')}`)

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node scripts/run-e2e-with-env.mjs <cmd> [args...]')
  process.exit(1)
}
const [cmd, ...cmdArgs] = args
const r = spawnSync(cmd, cmdArgs, {
  stdio: 'inherit',
  env: process.env,
  shell: true,
  cwd: root,
})
process.exit(r.status ?? 1)
