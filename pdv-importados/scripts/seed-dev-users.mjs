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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''

const password =
  process.env.SEED_DEV_PASSWORD?.trim() ||
  process.env.PLAYWRIGHT_TEST_PASSWORD?.trim() ||
  ''

const gerenteEmail =
  process.env.SEED_GERENTE_EMAIL?.trim() || 'e2e-gerente@localhost.test'
const operadorEmail =
  process.env.SEED_OPERADOR_EMAIL?.trim() || 'e2e-operador@localhost.test'

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

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (listErr) throw listErr

  const found = list.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  )
  if (!found) {
    throw new Error(
      `Auth indica que ${email} já existe, mas não foi encontrado em listUsers (primeira página).`,
    )
  }
  return found
}

async function upsertUsuario(supabase, userId, { nome, perfil, idioma_preferido }) {
  const { error } = await supabase.from('usuarios').upsert(
    {
      id: userId,
      nome,
      perfil,
      idioma_preferido: idioma_preferido || 'pt',
      ativo: true,
    },
    { onConflict: 'id' },
  )
  if (error) throw error
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
      'Defina SEED_DEV_PASSWORD (recomendado) ou PLAYWRIGHT_TEST_PASSWORD com a senha dos usuários de teste.',
    )
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('Supabase URL:', url)

  const gerente = await ensureAuthUser(supabase, gerenteEmail, password)
  await upsertUsuario(supabase, gerente.id, {
    nome: 'Gerente E2E',
    perfil: 'GERENTE',
    idioma_preferido: 'pt',
  })
  console.log('OK GERENTE:', gerenteEmail, '→', gerente.id)

  const operador = await ensureAuthUser(supabase, operadorEmail, password)
  await upsertUsuario(supabase, operador.id, {
    nome: 'Operador E2E',
    perfil: 'OPERADOR',
    idioma_preferido: 'pt',
  })
  console.log('OK OPERADOR:', operadorEmail, '→', operador.id)

  console.log('\nPlaywright (gerente):')
  console.log(`  PLAYWRIGHT_TEST_EMAIL=${gerenteEmail}`)
  console.log(`  PLAYWRIGHT_TEST_PASSWORD=${password === '' ? '(sua senha)' : '***'}`)
  console.log('\nConcluído.')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
