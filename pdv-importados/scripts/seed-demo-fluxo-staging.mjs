#!/usr/bin/env node
/**
 * Seed mínimo para fluxo demo E2E em staging.
 * Requer: seed:dev-users já executado + migration 027 (catálogo demo).
 *
 * Garante: 1 loja (Matriz), 1 operador com caixa ABERTO.
 *
 * Uso: npm run seed:demo-fluxo
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local')
  if (!fs.existsSync(p)) return
  const text = fs.readFileSync(p, 'utf8')
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvLocal()

const url =
  process.env.SUPABASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  ''

// Guard de ambiente (go-live), mesmo padrão de backend/scripts/fallback-sem-rpc-real.mjs:
// o projeto Supabase é único (produção = Preview = E2E); este script grava dados e só
// roda em localhost/127.0.0.1, antes de qualquer conexão.
if (url && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  console.error(`RECUSADO: o alvo não é local; este script grava dados e não pode rodar contra produção. URL=${url}`)
  process.exit(2)
}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
const LOJA_MATRIZ_ID = 'a0000001-0000-4000-8000-000000000001'
const TROCO_INICIAL = 100
const operadorEmail =
  process.env.SEED_OPERADOR_EMAIL?.trim() || 'e2e-operador@localhost.test'

async function main() {
  if (!url || !serviceKey) {
    console.error('Defina SUPABASE_SERVICE_ROLE_KEY e SUPABASE_URL em .env.local')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: loja, error: lojaErr } = await supabase
    .from('lojas')
    .select('id, nome')
    .eq('id', LOJA_MATRIZ_ID)
    .maybeSingle()
  if (lojaErr) throw lojaErr
  if (!loja) {
    console.error('Loja Matriz ausente — aplique migrations 032+')
    process.exit(1)
  }
  console.log('[seed:demo-fluxo] loja OK:', loja.nome)

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (listErr) throw listErr
  const operadorAuth = list.users.find(
    (u) => u.email?.toLowerCase() === operadorEmail.toLowerCase(),
  )
  if (!operadorAuth) {
    console.error(`Operador ${operadorEmail} não encontrado — rode npm run seed:dev-users`)
    process.exit(1)
  }

  const { data: usuario, error: usrErr } = await supabase
    .from('usuarios')
    .select('id, nome, perfil')
    .eq('id', operadorAuth.id)
    .maybeSingle()
  if (usrErr) throw usrErr
  if (!usuario) {
    console.error('Linha usuarios ausente para operador — rode seed:dev-users')
    process.exit(1)
  }
  console.log('[seed:demo-fluxo] operador OK:', usuario.nome)

  const { data: caixaAberto } = await supabase
    .from('caixas')
    .select('id')
    .eq('operador_id', operadorAuth.id)
    .eq('status', 'ABERTO')
    .maybeSingle()

  if (caixaAberto) {
    console.log('[seed:demo-fluxo] caixa já aberto:', caixaAberto.id)
  } else {
    const { data: novo, error: insErr } = await supabase
      .from('caixas')
      .insert({
        operador_id: operadorAuth.id,
        loja_id: LOJA_MATRIZ_ID,
        valor_inicial: TROCO_INICIAL,
        status: 'ABERTO',
      })
      .select('id')
      .single()
    if (insErr) throw insErr
    console.log('[seed:demo-fluxo] caixa aberto:', novo.id, 'troco', TROCO_INICIAL)
  }

  const { data: prod } = await supabase
    .from('produtos')
    .select('id, nome')
    .eq('codigo_barras', '7898512340015')
    .maybeSingle()
  if (!prod) {
    console.warn('[seed:demo-fluxo] produto demo 7898512340015 ausente — aplique migration 027')
  } else {
    console.log('[seed:demo-fluxo] produto demo OK:', prod.nome)
  }

  console.log('[seed:demo-fluxo] pronto — acesse /demo-fluxo como operador')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
