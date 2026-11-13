#!/usr/bin/env node
/**
 * Cria usuários no Supabase Auth e linhas em `public.usuarios` (dev / E2E).
 *
 * Requer chave **service_role** (ignora RLS). Nunca exponha no cliente nem commite.
 *
 * Uso (na pasta pdv-importados):
 *   npm run seed:dev-users
 *
 * Variáveis: ver docs/SEED_DEV_E2E.md
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

const password =
  process.env.SEED_DEV_PASSWORD?.trim() ||
  process.env.PLAYWRIGHT_CAIXA_TEST_PASSWORD?.trim() ||
  process.env.PLAYWRIGHT_TEST_PASSWORD?.trim() ||
  ''

const donoEmail =
  process.env.SEED_DONO_EMAIL?.trim() || 'e2e-dono@localhost.test'
const gerenteEmail =
  process.env.SEED_GERENTE_EMAIL?.trim() || 'e2e-gerente@localhost.test'
const operadorEmail =
  process.env.SEED_OPERADOR_EMAIL?.trim() ||
  process.env.PLAYWRIGHT_CAIXA_TEST_EMAIL?.trim() ||
  'e2e-operador@localhost.test'

/** Alinhado a `032_lojas_estoque_por_loja.sql` e `lib/auth/lojaUsuario.ts` (LOJA_MATRIZ_ID). */
const LOJA_MATRIZ_ID = 'a0000001-0000-4000-8000-000000000001'

async function findAuthUserByEmail(supabase, email) {
  const target = email.toLowerCase()
  for (let page = 1; page <= 10; page += 1) {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (listErr) throw listErr
    const found = list.users.find((u) => u.email?.toLowerCase() === target)
    if (found) return found
    if ((list.users?.length ?? 0) < 200) break
  }
  return null
}

async function ensureAuthUser(supabase, email, pwd) {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: pwd,
    email_confirm: true,
  })

  if (!createErr && created?.user) {
    return created.user
  }

  const msg = createErr?.message || ''
  if (!/already|registered|exists|duplicate/i.test(msg)) {
    throw createErr || new Error('createUser falhou sem mensagem')
  }

  const found = await findAuthUserByEmail(supabase, email)
  if (!found) {
    throw new Error(
      `Auth indica que ${email} já existe, mas não foi encontrado em listUsers.`,
    )
  }

  // Re-seed deve alinhar a senha ao .env.local (P0.1): createUser não atualiza existentes.
  const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(
    found.id,
    { password: pwd, email_confirm: true },
  )
  if (updateErr) throw updateErr
  return updated?.user ?? found
}

async function upsertUsuario(supabase, userId, { nome, perfil, idioma_preferido, loja_id }) {
  const { error } = await supabase.from('usuarios').upsert(
    {
      id: userId,
      nome,
      perfil,
      idioma_preferido: idioma_preferido || 'pt',
      ativo: true,
      loja_id: loja_id ?? LOJA_MATRIZ_ID,
    },
    { onConflict: 'id' },
  )
  if (error) throw error
}

/**
 * Garante, na loja matriz, uma conta financeira vinculada às formas PIX, CARTAO_DEBITO e
 * CARTAO_CREDITO (idempotente). Usa o mesmo papel de `criado_por` do gerente E2E.
 */
async function ensureFormasFinanceirasLojaMatriz(supabase, gerenteId) {
  const { data: existentes, error: errExist } = await supabase
    .from('financeiro_contas_forma')
    .select('forma_pagamento')
    .eq('loja_id', LOJA_MATRIZ_ID)
  if (errExist) throw errExist
  const formas = ['PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO']
  const jaTem = new Set((existentes ?? []).map((r) => r.forma_pagamento))
  if (formas.every((f) => jaTem.has(f))) return

  const { data: conta, error: errConta } = await supabase
    .from('contas_financeiras')
    .insert({
      loja_id: LOJA_MATRIZ_ID,
      nome: 'E2E Conta Banco',
      tipo: 'BANCO',
      ativo: true,
      data_inicial: new Date().toISOString().slice(0, 10),
      criado_por: gerenteId,
    })
    .select('id')
    .single()
  if (errConta) throw errConta

  const linhas = formas
    .filter((f) => !jaTem.has(f))
    .map((forma_pagamento) => ({
      loja_id: LOJA_MATRIZ_ID,
      forma_pagamento,
      conta_financeira_id: conta.id,
    }))
  const { error: errForma } = await supabase
    .from('financeiro_contas_forma')
    .upsert(linhas, { onConflict: 'loja_id,forma_pagamento', ignoreDuplicates: true })
  if (errForma) throw errForma
  console.log('OK conta financeira E2E (PIX/cartão) na loja matriz')
}

async function main() {
  if (!url || !serviceKey) {
    console.error(
      'Defina SUPABASE_SERVICE_ROLE_KEY e SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) em .env.local.',
    )
    console.error('Veja docs/SEED_DEV_E2E.md')
    process.exit(1)
  }

  if (!password) {
    console.error(
      'Defina SEED_DEV_PASSWORD (recomendado), PLAYWRIGHT_CAIXA_TEST_PASSWORD ou PLAYWRIGHT_TEST_PASSWORD.',
    )
    process.exit(1)
  }

  const seedPwd = process.env.SEED_DEV_PASSWORD?.trim() || ''
  const caixaPwd = process.env.PLAYWRIGHT_CAIXA_TEST_PASSWORD?.trim() || ''
  const painelPwd = process.env.PLAYWRIGHT_TEST_PASSWORD?.trim() || ''
  if (seedPwd && caixaPwd && seedPwd !== caixaPwd) {
    console.error(
      'SEED_DEV_PASSWORD e PLAYWRIGHT_CAIXA_TEST_PASSWORD diferem. ' +
        'Use a mesma senha nos dois para o E2E de /caixa autenticar no Auth.',
    )
    process.exit(1)
  }
  if (seedPwd && painelPwd && seedPwd !== painelPwd) {
    console.error(
      'SEED_DEV_PASSWORD e PLAYWRIGHT_TEST_PASSWORD diferem. Alinhe as senhas de teste.',
    )
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('Supabase URL:', url)
  console.log(
    'Senha fonte:',
    seedPwd ? 'SEED_DEV_PASSWORD' : caixaPwd ? 'PLAYWRIGHT_CAIXA_TEST_PASSWORD' : 'PLAYWRIGHT_TEST_PASSWORD',
  )

  const dono = await ensureAuthUser(supabase, donoEmail, password)
  await upsertUsuario(supabase, dono.id, {
    nome: 'Dono E2E',
    perfil: 'DONO',
    idioma_preferido: 'pt',
  })
  console.log('OK DONO:', donoEmail, '→', dono.id)

  const gerente = await ensureAuthUser(supabase, gerenteEmail, password)
  await upsertUsuario(supabase, gerente.id, {
    nome: 'Gerente E2E',
    perfil: 'GERENTE',
    idioma_preferido: 'pt',
  })
  console.log('OK GERENTE:', gerenteEmail, '→', gerente.id)

  // D5 (20261107110000): PIX e cartão exigem conta financeira vinculada à forma na loja.
  // Sem isto, as vendas E2E em PIX/cartão falham com PAGAMENTO_SEM_CONTA_FINANCEIRA.
  await ensureFormasFinanceirasLojaMatriz(supabase, gerente.id)

  const operador = await ensureAuthUser(supabase, operadorEmail, password)
  await upsertUsuario(supabase, operador.id, {
    nome: 'Operador E2E',
    perfil: 'OPERADOR',
    idioma_preferido: 'pt',
  })
  console.log('OK OPERADOR:', operadorEmail, '→', operador.id)

  // Prova de login do operador (anon) — critério P0.1 sem imprimir senha.
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ''
  if (anonKey) {
    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: sess, error: loginErr } = await anon.auth.signInWithPassword({
      email: operadorEmail,
      password,
    })
    if (loginErr || !sess.session) {
      console.error('FAIL login operador (anon):', loginErr?.message || 'sem sessão')
      process.exit(1)
    }
    await anon.auth.signOut()
    console.log('OK login operador (anon) verificado')
  } else {
    console.warn('AVISO: sem ANON/PUBLISHABLE key — login operador não verificado')
  }

  console.log('\nPlaywright (painel):')
  console.log(`  PLAYWRIGHT_TEST_EMAIL=${gerenteEmail}`)
  console.log('  PLAYWRIGHT_TEST_PASSWORD=*** (mesma senha do seed)')
  console.log('\nPlaywright (caixa):')
  console.log(`  PLAYWRIGHT_CAIXA_TEST_EMAIL=${operadorEmail}`)
  console.log('  PLAYWRIGHT_CAIXA_TEST_PASSWORD=*** (mesma senha do seed)')
  console.log('\nConcluído.')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
