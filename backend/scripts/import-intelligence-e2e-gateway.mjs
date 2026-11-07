#!/usr/bin/env node
/**
 * Gateway LOCAL para E2E do Import Intelligence (sem Docker/Supabase CLI).
 * - /rest/v1/*  → PostgREST local (PGRST_URL, padrão http://127.0.0.1:3001)
 * - /auth/v1/*  → stub mínimo de GoTrue (senha via crypt() no Postgres local; JWT HS256)
 * SOMENTE para banco local com dados fictícios. Recusa DATABASE diferente de localhost.
 * Uso: E2E_DB=imp_e2e E2E_JWT_SECRET=... node backend/scripts/import-intelligence-e2e-gateway.mjs
 */
import http from 'node:http'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const PORT = Number(process.env.E2E_GATEWAY_PORT ?? 54321)
const PGRST = process.env.PGRST_URL ?? 'http://127.0.0.1:3001'
const DB = process.env.E2E_DB ?? 'imp_e2e'
const SECRET = process.env.E2E_JWT_SECRET
if (!SECRET || SECRET.length < 32) throw new Error('E2E_JWT_SECRET (>=32 chars) obrigatório')

const b64 = (b) => Buffer.from(b).toString('base64url')
function sign(payload) {
  const h = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const p = b64(JSON.stringify(payload))
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`
}
function verify(tok) {
  const [h, p, s] = String(tok ?? '').split('.')
  if (!s) return null
  const ok = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')
  if (ok.length !== s.length || !crypto.timingSafeEqual(Buffer.from(ok), Buffer.from(s))) return null
  const c = JSON.parse(Buffer.from(p, 'base64url').toString())
  return c.exp * 1000 > Date.now() ? c : null
}
function sql(query, vars) {
  const args = ['-u', 'postgres', 'psql', '-X', '-At', '-d', DB, '-v', 'ON_ERROR_STOP=1']
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`)
  return execFileSync('sudo', args, { input: query, encoding: 'utf8' }).trim()
}
const userRow = (where, vars) => {
  const r = sql(`SELECT row_to_json(x) FROM (SELECT id, email, raw_app_meta_data, raw_user_meta_data, created_at FROM auth.users WHERE ${where}) x;`, vars)
  return r ? JSON.parse(r) : null
}
const userObj = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: u.raw_app_meta_data ?? {}, user_metadata: u.raw_user_meta_data ?? {}, created_at: u.created_at })
const refresh = new Map()
function sessao(u) {
  const now = Math.floor(Date.now() / 1000)
  const access_token = sign({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, iat: now, exp: now + 3600 })
  const refresh_token = crypto.randomBytes(24).toString('hex')
  refresh.set(refresh_token, u.id)
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token, user: userObj(u) }
}
const corpo = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => ok(d)) })
const json = (res, st, o) => { res.writeHead(st, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(o)) }

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end() }
  if (url.pathname.startsWith('/auth/v1/')) {
    const rota = url.pathname.slice(9)
    if (rota === 'token') {
      const b = JSON.parse((await corpo(req)) || '{}')
      if (url.searchParams.get('grant_type') === 'password') {
        const u = userRow(`lower(email) = lower(:'email') AND encrypted_password = extensions.crypt(:'senha', encrypted_password)`, { email: String(b.email ?? ''), senha: String(b.password ?? '') })
        return u ? json(res, 200, sessao(u)) : json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials' })
      }
      const id = refresh.get(String(b.refresh_token ?? ''))
      const u = id ? userRow(`id = :'id'::uuid`, { id }) : null
      return u ? json(res, 200, sessao(u)) : json(res, 400, { error: 'invalid_grant' })
    }
    if (rota === 'user') {
      const c = verify((req.headers.authorization ?? '').replace(/^Bearer /i, ''))
      const u = c ? userRow(`id = :'id'::uuid`, { id: c.sub }) : null
      return u ? json(res, 200, userObj(u)) : json(res, 401, { code: 401, msg: 'invalid JWT' })
    }
    if (rota === 'logout') { res.writeHead(204); return res.end() }
    return json(res, 404, { msg: 'not implemented in local stub' })
  }
  if (url.pathname.startsWith('/rest/v1')) {
    const alvo = new URL(PGRST + url.pathname.slice(8) + url.search)
    const headers = { ...req.headers, host: alvo.host }
    const b = await corpo(req)
    const p = http.request(alvo, { method: req.method, headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res) })
    p.on('error', () => json(res, 502, { msg: 'postgrest indisponível' }))
    if (b) p.write(b)
    return p.end()
  }
  json(res, 404, { msg: 'not found' })
}).listen(PORT, '127.0.0.1', () => console.log(`gateway e2e local em http://127.0.0.1:${PORT}`))
