#!/usr/bin/env node
/**
 * Seed sintético multi-loja para capacidade (STG-01).
 *
 * Cria N lojas (codigo CAP_Lnn), 1 gerente + 2 operadores/loja, produtos e estoque.
 * Modelo atual: isolamento por loja_id — sem empresa_id.
 *
 * Pré-requisitos: migrations aplicadas no projeto de staging; guard de alvo OK.
 * NÃO lê nem altera .env.local.
 *
 *   CAPACITY_ENV=staging \
 *   CAPACITY_ALLOWED_PROJECT_REF=... \
 *   CAPACITY_SUPABASE_URL=https://....supabase.co \
 *   CAPACITY_SERVICE_ROLE_KEY=... \
 *   CAPACITY_SEED_PASSWORD=... \
 *   CAPACITY_LOJAS=5 \
 *   node scripts/staging/seed-capacity-catalog.mjs
 */
import { createClient } from '@supabase/supabase-js'
import {
  assertStagingEnv,
  CAPACITY_SKU_LAST_UNIT,
  gerenteEmail,
  lojaCodigo,
  lojaIdForIndex,
  operadorEmail,
  produtoCodigo,
} from './lib-env.mjs'

const LOJAS = Math.min(50, Math.max(1, Number(process.env.CAPACITY_LOJAS || 1)))
const CAIXAS_POR_LOJA = Math.min(4, Math.max(1, Number(process.env.CAPACITY_CAIXAS_POR_LOJA || 2)))
const ESTOQUE_PADRAO = Number(process.env.CAPACITY_ESTOQUE_QTD || 10_000)

async function findAuthUserByEmail(supabase, email) {
  const target = email.toLowerCase()
  for (let page = 1; page <= 20; page += 1) {
    const { data: list, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const found = list.users.find((u) => u.email?.toLowerCase() === target)
    if (found) return found
    if ((list.users?.length ?? 0) < 200) break
  }
  return null
}

async function ensureAuthUser(supabase, email, password) {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (!error && created?.user) return created.user

  const msg = error?.message || ''
  if (!/already|registered|exists|duplicate/i.test(msg)) throw error

  const found = await findAuthUserByEmail(supabase, email)
  if (!found) throw new Error(`Auth: ${email} existe mas não listado`)
  const { data: updated, error: updErr } = await supabase.auth.admin.updateUserById(
    found.id,
    { password, email_confirm: true },
  )
  if (updErr) throw updErr
  return updated?.user ?? found
}

async function upsertUsuario(supabase, userId, row) {
  const { error } = await supabase.from('usuarios').upsert(
    { id: userId, ativo: true, idioma_preferido: 'pt', ...row },
    { onConflict: 'id' },
  )
  if (error) throw error
}

async function seedLoja(supabase, password, n) {
  const lojaId = lojaIdForIndex(n)
  const codigo = lojaCodigo(n)
  const { error: lojaErr } = await supabase.from('lojas').upsert(
    {
      id: lojaId,
      nome: `[CAP] Loja ${String(n).padStart(2, '0')}`,
      codigo,
      ativo: true,
    },
    { onConflict: 'id' },
  )
  if (lojaErr) throw lojaErr

  const gEmail = gerenteEmail(n)
  const gerente = await ensureAuthUser(supabase, gEmail, password)
  await upsertUsuario(supabase, gerente.id, {
    nome: `[CAP] Gerente L${n}`,
    perfil: 'GERENTE',
    loja_id: lojaId,
  })

  for (let c = 1; c <= CAIXAS_POR_LOJA; c += 1) {
    const email = operadorEmail(n, c)
    const op = await ensureAuthUser(supabase, email, password)
    await upsertUsuario(supabase, op.id, {
      nome: `[CAP] Op L${n} C${c}`,
      perfil: 'OPERADOR',
      loja_id: lojaId,
    })
  }

  await seedProdutosEstoque(supabase, lojaId, n)
  console.log(`[seed-capacity] loja ${codigo} OK (${CAIXAS_POR_LOJA} operadores)`)
}

async function seedProdutosEstoque(supabase, lojaId, n) {
  const items = [
    {
      codigo_barras: produtoCodigo(n, 1),
      nome: `[CAP] SKU principal L${n}`,
      preco_varejo: 19.9,
      preco_custo: 8.0,
      qty: ESTOQUE_PADRAO,
    },
    {
      codigo_barras: produtoCodigo(n, 2),
      nome: `[CAP] SKU secundário L${n}`,
      preco_varejo: 49.9,
      preco_custo: 20.0,
      qty: ESTOQUE_PADRAO,
    },
    {
      codigo_barras: produtoCodigo(n, 99),
      nome: `[CAP] ${CAPACITY_SKU_LAST_UNIT} L${n}`,
      preco_varejo: 9.9,
      preco_custo: 3.0,
      qty: 1,
    },
  ]

  for (const item of items) {
    const { data: existing } = await supabase
      .from('produtos')
      .select('id')
      .eq('loja_id', lojaId)
      .eq('codigo_barras', item.codigo_barras)
      .maybeSingle()

    let produtoId = existing?.id
    if (!produtoId) {
      const { data: inserted, error } = await supabase
        .from('produtos')
        .insert({
          loja_id: lojaId,
          codigo_barras: item.codigo_barras,
          nome: item.nome,
          preco_varejo: item.preco_varejo,
          preco_custo: item.preco_custo,
          unidade_medida: 'UN',
          ativo: true,
          status_publicacao: 'PUBLICADO',
        })
        .select('id')
        .single()
      if (error) throw error
      produtoId = inserted.id
    }

    const { error: estErr } = await supabase.from('estoque').upsert(
      {
        produto_id: produtoId,
        loja_id: lojaId,
        quantidade_atual: item.qty,
      },
      { onConflict: 'produto_id,loja_id' },
    )
    if (estErr) throw estErr
  }
}

async function main() {
  const { url, serviceKey, password } = assertStagingEnv()
  if (process.env.CAPACITY_CONFIRM_SEED !== 'yes') {
    console.error(
      'Recusado: defina CAPACITY_CONFIRM_SEED=yes após revisar o alvo (staging only).',
    )
    process.exit(2)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`[seed-capacity] alvo OK — semeando ${LOJAS} loja(s)`)
  for (let n = 1; n <= LOJAS; n += 1) {
    await seedLoja(supabase, password, n)
  }
  console.log('[seed-capacity] concluído')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
