#!/usr/bin/env node
/**
 * Smoke de autorização de `pdv_diagnostico_pre_producao` (migration 20261009150000) — STACK LOCAL APENAS.
 *
 * Prova, com logins reais e a API real (PostgREST):
 *   - OPERADOR e GERENTE recebem 42501 (`nao_autorizado`) ao chamar a RPC direto;
 *   - DONO e ADMIN recebem o checklist (JSON com `checks`).
 *
 * Uso (stack local no ar, com o seed; ADMIN local opcional via ADMIN_EMAIL):
 *   SUPABASE_URL=http://127.0.0.1:54321 ANON_KEY=... SEED_PASSWORD=... \
 *     node backend/scripts/pdv-diagnostico-authz-smoke.mjs
 *
 * Recusa qualquer URL que não seja local. Não imprime chaves nem senhas.
 */
const API = (process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321').replace(/\/$/, '')
const ANON = process.env.ANON_KEY
const PW = process.env.SEED_PASSWORD
const ADMIN_EMAIL = process.env.ADMIN_EMAIL

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`RECUSADO: SUPABASE_URL (${API}) não é local.`)
  process.exit(2)
}
if (!ANON || !PW) {
  console.error('Faltam ANON_KEY ou SEED_PASSWORD.')
  process.exit(2)
}

async function login(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error(`login falhou: ${email}`)
  return j.access_token
}
async function diag(token) {
  const r = await fetch(`${API}/rest/v1/rpc/pdv_diagnostico_pre_producao`, {
    method: 'POST',
    headers: { apikey: ANON, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: r.status, json }
}

let falhas = 0
const check = (nome, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}${extra ? ` — ${extra}` : ''}`)
  if (!ok) falhas++
}

for (const [rotulo, email] of [
  ['OPERADOR', 'operador.seed@local.test'],
  ['GERENTE', 'gerente.seed@local.test'],
]) {
  const r = await diag(await login(email))
  const negado = r.status >= 400 && JSON.stringify(r.json).includes('nao_autorizado')
  check(`${rotulo} é negado (nao_autorizado)`, negado, `HTTP ${r.status}`)
}

const alvos = [['DONO', 'dono.seed@local.test']]
if (ADMIN_EMAIL) alvos.push(['ADMIN', ADMIN_EMAIL])
for (const [rotulo, email] of alvos) {
  const r = await diag(await login(email))
  const ok = r.status === 200 && r.json && typeof r.json === 'object' && Array.isArray(r.json.checks)
  check(`${rotulo} recebe o checklist`, ok, `HTTP ${r.status}`)
}

console.log(falhas === 0 ? '\nTODOS OS CHECKS PASSARAM' : `\n${falhas} CHECK(S) FALHARAM`)
process.exit(falhas === 0 ? 0 : 1)
