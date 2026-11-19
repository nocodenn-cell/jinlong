// Helper da stack E2E: executa SQL (arquivo ou string) no container fp_e2e_db, sem expor segredos no terminal.
// Uso: node e2e-db.mjs --file <arquivo.sql> [--db sec_gf01] [--set-role-passwords]
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const envFile = join(dir, '.env.e2e')
if (!existsSync(envFile)) throw new Error('.env.e2e ausente: rode gen-env.mjs')
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter(Boolean).map((l) => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]
}))

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const db = opt('--db', 'sec_gf01')
let sql = ''
if (args.includes('--set-role-passwords')) {
  const pw = env.E2E_DB_PASSWORD.replace(/'/g, "''")
  sql += ['authenticator', 'supabase_auth_admin', 'supabase_storage_admin']
    .filter((r) => true).map((r) => `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${r}') THEN EXECUTE format('ALTER ROLE %I PASSWORD %L', '${r}', '${pw}'); END IF; END $$;`).join('\n') + '\n'
}
if (args.includes('--file')) sql += readFileSync(opt('--file'), 'utf8')
const r = spawnSync('docker', ['exec', '-i', 'fp_e2e_db', 'psql', '-U', opt('--user', 'postgres'), '-d', db, '-v', 'ON_ERROR_STOP=1', '-q'], { input: sql, encoding: 'utf8' })
process.stdout.write(r.stdout ?? '')
process.stderr.write(r.stderr ?? '')
process.exit(r.status ?? 1)
