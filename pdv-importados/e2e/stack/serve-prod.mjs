// Sobe o next start (build de produção já existente) com o mesmo ambiente da stack E2E. Uso: node serve-prod.mjs <pasta-de-log>
import { readFileSync, openSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const pdv = resolve(here, '..', '..')
const e = Object.fromEntries(readFileSync(join(here, '.env.e2e'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const s = JSON.parse(readFileSync(join(here, '.secrets.json'), 'utf8'))
const logDir = process.argv[2]
mkdirSync(logDir, { recursive: true })
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${e.E2E_API_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: e.E2E_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: e.E2E_SERVICE_KEY,
  PLAYWRIGHT_CAIXA_TEST_EMAIL: s.email,
  PLAYWRIGHT_CAIXA_TEST_PASSWORD: s.password,
}
const fd = openSync(join(logDir, 'next-start.log'), 'w')
const p = spawn('npx', ['next', 'start', '-p', e.E2E_APP_PORT], { cwd: pdv, env, shell: true, detached: true, stdio: ['ignore', fd, fd] })
p.unref()
console.log('next start iniciado, pid', p.pid)
