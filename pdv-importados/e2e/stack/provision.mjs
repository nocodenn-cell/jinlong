// Provisiona a stack E2E isolada do Golden Flow (JL-GO-LIVE-01). Idempotente por reconstrução:
//  1. snapshot read-only de sec_gf01 (pg_dump no container compartilhado, SEM alterá-lo) para um arquivo fora do repo;
//  2. para rest/auth da stack E2E, recria o banco E2E sec_gf01 a partir do snapshot e ajusta donos do schema auth;
//  3. cria o usuário de teste no GoTrue da stack E2E com senha gerada (gravada em .secrets.json, nunca impressa);
//  4. aplica o seed determinístico (empresa, loja, operador, produtos, estoque, formas, pdv_config).
// Nada aqui toca postgres, supabase_* compartilhados ou a homologação/produção.
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, openSync, closeSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const COMPOSE = join(dir, 'docker-compose.e2e.yml')
const ENV_FILE = join(dir, '.env.e2e')
const SECRETS = join(dir, '.secrets.json')
const SNAP_DIR = process.env.E2E_SNAPSHOT_DIR
if (!SNAP_DIR) throw new Error('Defina E2E_SNAPSHOT_DIR (pasta FORA do repositório) para o snapshot do banco.')
const SNAP = join(SNAP_DIR, 'sec_gf01.dump')

const env = Object.fromEntries(readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean).map((l) => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]
}))
const API = `http://localhost:${env.E2E_API_PORT}`
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts })
const must = (r, rotulo) => { if (r.status !== 0) throw new Error(`${rotulo} falhou (exit ${r.status}): ${(r.stderr || '').slice(0, 400)}`) }
const compose = (...a) => run('docker', ['compose', '-f', COMPOSE, '--env-file', ENV_FILE, ...a])
const psql = (db, sql, user = 'supabase_admin') => run('docker', ['exec', '-i', 'fp_e2e_db', 'psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q'], { input: sql })

// 1) snapshot (leitura pura do container compartilhado)
mkdirSync(SNAP_DIR, { recursive: true })
if (!existsSync(SNAP)) {
  const fd = openSync(SNAP, 'w')
  const r = spawnSync('docker', ['exec', 'supabase_db_fastproduct', 'pg_dump', '-U', 'postgres', '-Fc', '-d', 'sec_gf01'], { stdio: ['ignore', fd, 'pipe'] })
  closeSync(fd)
  if (r.status !== 0) throw new Error('pg_dump de sec_gf01 falhou')
  console.log('snapshot criado (fora do repo)')
}

// 2) recria o banco E2E a partir do snapshot
// senhas das roles internas da imagem: reaplicadas a cada provisionamento (um restart do container pode repor a autenticação)
must(run('node', [join(dir, 'e2e-db.mjs'), '--user', 'supabase_admin', '--set-role-passwords', '--db', 'postgres']), 'senhas das roles internas')
must(compose('stop', 'e2e_rest', 'e2e_auth'), 'stop rest/auth')
must(psql('postgres', 'DROP DATABASE IF EXISTS sec_gf01; CREATE DATABASE sec_gf01;', 'supabase_admin'), 'recriar sec_gf01 (E2E)')
const restore = spawnSync('docker', ['exec', '-i', 'fp_e2e_db', 'pg_restore', '-U', 'supabase_admin', '-d', 'sec_gf01', '--no-owner'], { input: readFileSync(SNAP) })
console.log(`restore: exit ${restore.status} (erros conhecidos e inofensivos: vault/realtime, ausentes na imagem reduzida)`)
must(psql('sec_gf01', `
ALTER SCHEMA auth OWNER TO supabase_auth_admin;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='auth' LOOP
    EXECUTE format('ALTER TABLE auth.%I OWNER TO supabase_auth_admin', r.tablename); END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname='auth' LOOP
    EXECUTE format('ALTER SEQUENCE auth.%I OWNER TO supabase_auth_admin', r.sequencename); END LOOP;
END $$;`), 'ajuste de donos do auth')
must(compose('up', '-d', 'e2e_rest', 'e2e_auth'), 'subir rest/auth')
// o Kong resolve upstreams na inicialização: reinicia após recriar rest/auth (evita 502 com IP antigo)
must(compose('restart', 'e2e_kong'), 'reiniciar kong')

// aguarda GoTrue
let ok = false
for (let i = 0; i < 60 && !ok; i++) {
  try { ok = (await fetch(`${API}/auth/v1/health`)).ok } catch { /* aguardando */ }
  if (!ok) await new Promise((r) => setTimeout(r, 2000))
}
if (!ok) throw new Error('GoTrue da stack E2E não respondeu em /auth/v1/health')

// 3) usuário de teste (senha gerada; só vai para .secrets.json)
let secrets = existsSync(SECRETS) ? JSON.parse(readFileSync(SECRETS, 'utf8')) : null
if (!secrets) {
  secrets = {
    email: 'operador.e2e@fastproduct.test',
    password: randomBytes(24).toString('base64url') + 'Aa9!',
  }
  writeFileSync(SECRETS, JSON.stringify(secrets, null, 2), { mode: 0o600 })
}
const srv = env.E2E_SERVICE_KEY
const admin = await fetch(`${API}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: srv, Authorization: `Bearer ${srv}`, 'content-type': 'application/json' },
  body: JSON.stringify({ email: secrets.email, password: secrets.password, email_confirm: true }),
})
let uid
if (admin.ok) {
  uid = (await admin.json()).id
} else {
  const lista = await fetch(`${API}/auth/v1/admin/users?per_page=1000`, { headers: { apikey: srv, Authorization: `Bearer ${srv}` } })
  const u = (await lista.json()).users?.find((x) => x.email === secrets.email)
  if (!u) throw new Error(`criação do usuário falhou (HTTP ${admin.status})`)
  uid = u.id
  await fetch(`${API}/auth/v1/admin/users/${uid}`, { method: 'PUT', headers: { apikey: srv, Authorization: `Bearer ${srv}`, 'content-type': 'application/json' }, body: JSON.stringify({ password: secrets.password, email_confirm: true }) })
}
console.log('usuário de teste pronto no GoTrue da stack E2E (id registrado em .secrets.json)')
secrets.user_id = uid
writeFileSync(SECRETS, JSON.stringify(secrets, null, 2), { mode: 0o600 })

// 4) seed determinístico
const seed = readFileSync(join(dir, 'seed-golden-flow.sql'), 'utf8').replaceAll(':operador_id', `'${uid}'`)
must(psql('sec_gf01', seed, 'supabase_admin'), 'seed do golden flow')
console.log('seed aplicado')
