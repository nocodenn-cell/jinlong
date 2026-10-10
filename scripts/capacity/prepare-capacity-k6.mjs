#!/usr/bin/env node
/**
 * CAP-02 — prepara operadores/caixas/produtos para k6 local.
 * Lê APENAS status do workdir capacity (nunca NEXT_PUBLIC_* / .env.local).
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const WORKDIR = path.join(ROOT, '.capacity-workdir')
const OUT = path.join(WORKDIR, 'k6-fixtures.json')
const PASSWORD = process.env.CAPACITY_K6_PASSWORD || 'CapacityLocal!K6Op'
const LOJAS = Number(process.env.CAPACITY_LOJAS || 10)
const CAIXAS_POR_LOJA = Number(process.env.CAPACITY_CAIXAS_POR_LOJA || 2)

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

function assertLocal(url) {
  const u = String(url || '').replace(/\/$/, '')
  if (u !== 'http://127.0.0.1:54421') {
    throw new Error(`RECUSADO: API não é capacity local: ${url}`)
  }
}

async function admin(api, service, method, pathSuffix, body) {
  const res = await fetch(`${api}${pathSuffix}`, {
    method,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(`${method} ${pathSuffix} → ${res.status} ${text.slice(0, 300)}`)
  }
  return json
}

function sql(dbUrl, q) {
  const oneLine = String(q).replace(/\s+/g, ' ').trim()
  return execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -tAc ${JSON.stringify(oneLine)}`, {
    encoding: 'utf8',
  }).trim()
}

async function ensureUser(api, service, { id, email, nome, perfil, lojaId }) {
  // upsert auth via admin API
  const list = await admin(api, service, 'GET', `/auth/v1/admin/users?page=1&per_page=200`)
  const users = list?.users || []
  const found = users.find((u) => u.id === id || u.email === email)
  if (found) {
    await admin(api, service, 'PUT', `/auth/v1/admin/users/${found.id}`, {
      password: PASSWORD,
      email_confirm: true,
    })
    return found.id
  }
  const created = await admin(api, service, 'POST', '/auth/v1/admin/users', {
    id,
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  return created.id
}

function ensureSqlFixtures(dbUrl, cashiers) {
  for (const c of cashiers) {
    sql(
      dbUrl,
      `INSERT INTO public.usuarios (id,nome,perfil,ativo,loja_id)
       VALUES ('${c.operador_id}','${c.nome}','OPERADOR',true,'${c.loja_id}')
       ON CONFLICT (id) DO UPDATE SET loja_id=EXCLUDED.loja_id, ativo=true, perfil='OPERADOR'`,
    )
    sql(
      dbUrl,
      `INSERT INTO public.formas_pagamento (loja_id,codigo,nome,ativo)
       VALUES ('${c.loja_id}','DINHEIRO','Dinheiro',true)
       ON CONFLICT (loja_id, codigo) DO NOTHING`,
    )
    // open caixa for operator if missing
    const existing = sql(
      dbUrl,
      `SELECT id::text FROM public.caixas
       WHERE operador_id='${c.operador_id}' AND status='ABERTO' LIMIT 1`,
    )
    if (existing) {
      c.caixa_id = existing
    } else {
      const caixaId = randomUUID()
      sql(
        dbUrl,
        `INSERT INTO public.caixas (id,operador_id,loja_id,status,valor_inicial,saldo_atual)
         VALUES ('${caixaId}','${c.operador_id}','${c.loja_id}','ABERTO',0,0)`,
      )
      c.caixa_id = caixaId
    }
    const prod = sql(
      dbUrl,
      `SELECT p.id::text||'|'||(public.calcular_preco_produto(p.id,1,p.loja_id)->>'preco')
       FROM public.produtos p
       JOIN public.estoque e ON e.produto_id=p.id AND e.loja_id=p.loja_id AND e.quantidade_atual>100
       WHERE p.loja_id='${c.loja_id}' AND p.ativo AND p.preco_varejo>0
       ORDER BY p.id LIMIT 1`,
    )
    if (!prod) throw new Error(`sem produto com estoque na loja ${c.loja_id}`)
    const [produto_id, preco] = prod.split('|')
    c.produto_id = produto_id
    c.preco = Number(preco)
  }
}

async function main() {
  if (![1, 5, 10].includes(LOJAS)) throw new Error('CAPACITY_LOJAS deve ser 1|5|10')
  if (CAIXAS_POR_LOJA < 1 || CAIXAS_POR_LOJA > 4) {
    throw new Error('CAPACITY_CAIXAS_POR_LOJA inválido')
  }

  const env = statusEnv()
  const api = (env.API_URL || '').replace(/\/$/, '')
  const service = env.SERVICE_ROLE_KEY
  const anon = env.ANON_KEY
  const dbUrl = env.DB_URL || env.POSTGRES_URL
  assertLocal(api)
  if (!/127\.0\.0\.1:54422/.test(dbUrl)) throw new Error('DB não local')

  // Refuse leaking cloud-injected URLs into this process for fixtures
  const injected = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (injected && !/127\.0\.0\.1|localhost/.test(injected)) {
    console.warn(
      '[prepare-k6] IGNORANDO NEXT_PUBLIC_SUPABASE_URL injetado (não-local); usando status capacity',
    )
  }

  const lojaRows = sql(
    dbUrl,
    `SELECT id::text||'|'||coalesce(codigo,'') FROM public.lojas
     WHERE codigo='MATRIZ' OR codigo LIKE 'CAP_L%'
     ORDER BY CASE WHEN codigo='MATRIZ' THEN 0 ELSE 1 END, codigo
     LIMIT ${LOJAS}`,
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, codigo] = line.split('|')
      return { id, codigo }
    })

  if (lojaRows.length < LOJAS) {
    throw new Error(`esperado ${LOJAS} lojas, achou ${lojaRows.length} — rode seed synthetic`)
  }

  /** @type {Array<Record<string, unknown>>} */
  const cashiers = []
  for (let li = 0; li < lojaRows.length; li++) {
    const loja = lojaRows[li]
    for (let c = 1; c <= CAIXAS_POR_LOJA; c++) {
      const slot = li * CAIXAS_POR_LOJA + c
      let operador_id
      let email
      let nome
      if (loja.codigo === 'MATRIZ' && c === 1) {
        operador_id = '33333333-3333-4333-8333-333333333333'
        email = 'operador.seed@local.test'
        nome = 'K6 Op L01 C01'
      } else if (loja.codigo === 'MATRIZ' && c === 2) {
        operador_id = '44444444-4444-4444-8444-444444444444'
        email = 'operador2.seed@local.test'
        nome = 'K6 Op L01 C02'
      } else {
        // deterministic UUIDs for CAP lojas: c2 = op1 already from seed, c2xx for second
        const n = Number(loja.codigo.replace('CAP_L', ''))
        if (c === 1) {
          operador_id = `c2000000-0000-4000-8000-${String(n).padStart(12, '0')}`
          email = `operador.l${String(n).padStart(2, '0')}@capacity.local.test`
          nome = `K6 Op L${String(n).padStart(2, '0')} C01`
        } else {
          operador_id = `c2100000-0000-4000-8000-${String(n).padStart(12, '0')}`
          email = `operador.l${String(n).padStart(2, '0')}.c${c}@capacity.local.test`
          nome = `K6 Op L${String(n).padStart(2, '0')} C${String(c).padStart(2, '0')}`
        }
      }
      await ensureUser(api, service, {
        id: operador_id,
        email,
        nome,
        perfil: 'OPERADOR',
        lojaId: loja.id,
      })
      cashiers.push({
        slot,
        loja_id: loja.id,
        loja_codigo: loja.codigo,
        operador_id,
        email,
        nome,
        caixa_id: null,
        produto_id: null,
        preco: null,
      })
    }
  }

  ensureSqlFixtures(dbUrl, cashiers)

  // Verify password login for first cashier only (smoke)
  const login = await fetch(`${api}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cashiers[0].email, password: PASSWORD }),
  })
  if (!login.ok) {
    throw new Error(`login smoke falhou: ${login.status} ${await login.text()}`)
  }

  const fixture = {
    generated_at: new Date().toISOString(),
    api_url: api,
    db_url_host: '127.0.0.1:54422',
    project: 'fastproduct-capacity',
    lojas: LOJAS,
    caixas_por_loja: CAIXAS_POR_LOJA,
    password_env: 'CAPACITY_K6_PASSWORD',
    cashiers: cashiers.map(({ email, ...rest }) => ({
      ...rest,
      email,
    })),
  }
  fs.mkdirSync(WORKDIR, { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(fixture, null, 2))
  // password sidecar (gitignored via workdir)
  fs.writeFileSync(
    path.join(WORKDIR, 'k6-password.txt'),
    PASSWORD,
    { mode: 0o600 },
  )
  console.log(
    JSON.stringify(
      {
        ok: true,
        out: OUT,
        cashiers: cashiers.length,
        lojas: LOJAS,
        api,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
