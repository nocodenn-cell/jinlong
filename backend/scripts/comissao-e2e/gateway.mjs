// Gateway local mínimo (estilo Supabase) só para E2E: /rest/v1 -> PostgREST, /auth/v1 -> JWT HS256 local.
import http from 'node:http'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
const SECRET = process.env.JWT_SECRET, PORT = 54321, DB = process.env.DB || 'com_ui'
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
const sign = (p) => { const h = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(p); return h + '.' + crypto.createHmac('sha256', SECRET).update(h).digest('base64url') }
const verify = (t) => { try { const [h, p, s] = t.split('.'); if (crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url') !== s) return null; return JSON.parse(Buffer.from(p, 'base64url')) } catch { return null } }
const users = () => Object.fromEntries(execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-X', '-At', '-F', '\t', '-d', DB, '-c', "select email, id from auth.users where email is not null"]).toString().trim().split('\n').map((l) => l.split('\t')))
const userObj = (id, email) => ({ id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: { full_name: email.split('@')[0] }, created_at: '2026-01-01T00:00:00Z', updated_at: new Date().toISOString(), identities: [] })
const session = (id, email) => { const exp = Math.floor(Date.now() / 1000) + 3600; return { access_token: sign({ sub: id, email, role: 'authenticated', aud: 'authenticated', exp, iat: exp - 3600, session_id: id }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: Buffer.from(id + '|' + email).toString('base64url'), user: userObj(id, email) } }
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(o)) }
http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks); const url = new URL(req.url, 'http://x')
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end() }
    if (url.pathname.startsWith('/auth/v1/')) {
      const p = url.pathname.slice(9)
      if (p === 'token') {
        const b = JSON.parse(body.toString() || '{}')
        if (url.searchParams.get('grant_type') === 'password') { const id = users()[b.email]; return id && b.password === process.env.SENHA ? json(res, 200, session(id, b.email)) : json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials' }) }
        const [id, email] = Buffer.from(b.refresh_token || '', 'base64url').toString().split('|'); return id ? json(res, 200, session(id, email)) : json(res, 400, { error: 'invalid_grant' })
      }
      if (p === 'user') { const c = verify((req.headers.authorization || '').replace(/^Bearer /i, '')); return c && c.sub ? json(res, 200, userObj(c.sub, c.email)) : json(res, 401, { code: 401, msg: 'invalid JWT', error_code: 'bad_jwt' }) }
      if (p === 'logout') { res.writeHead(204); return res.end() }
      return json(res, 200, {})
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const headers = { ...req.headers }; delete headers.host; delete headers['content-length']
      if (!headers.authorization && headers.apikey) headers.authorization = 'Bearer ' + headers.apikey
      const r = http.request({ host: '127.0.0.1', port: 54330, path: url.pathname.slice(8) + url.search, method: req.method, headers: { ...headers, 'content-length': body.length } }, (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res) })
      r.on('error', (e) => json(res, 502, { message: String(e) })); r.end(body); return
    }
    json(res, 404, { message: 'not found ' + url.pathname })
  })
}).listen(PORT, () => console.log('gateway on', PORT))
