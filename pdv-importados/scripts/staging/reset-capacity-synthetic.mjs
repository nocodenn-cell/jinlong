#!/usr/bin/env node
/**
 * Remove APENAS dados sintéticos de capacidade (marcados CAP_* / @capacity.staging.invalid).
 * Nunca toca lojas MATRIZ / FILIAL_DEMO nem usuários fora do domínio sintético.
 *
 *   CAPACITY_CONFIRM_RESET=yes ... node scripts/staging/reset-capacity-synthetic.mjs
 */
import { createClient } from '@supabase/supabase-js'
import {
  assertStagingEnv,
  CAPACITY_EMAIL_DOMAIN,
  CAPACITY_LOJA_PREFIX,
} from './lib-env.mjs'

async function main() {
  const { url, serviceKey } = assertStagingEnv()
  if (process.env.CAPACITY_CONFIRM_RESET !== 'yes') {
    console.error('Recusado: defina CAPACITY_CONFIRM_RESET=yes')
    process.exit(2)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: lojas, error: lojaErr } = await supabase
    .from('lojas')
    .select('id, codigo')
    .like('codigo', `${CAPACITY_LOJA_PREFIX}%`)
  if (lojaErr) throw lojaErr

  const lojaIds = (lojas || []).map((l) => l.id)
  console.log(`[reset-capacity] lojas sintéticas: ${lojaIds.length}`)

  if (lojaIds.length > 0) {
    // Ordem: dependentes → lojas. Falhas parciais são logadas (schema pode variar).
    await deleteWhereIn(supabase, 'estoque', 'loja_id', lojaIds)
    await deleteWhereIn(supabase, 'produtos', 'loja_id', lojaIds)
    await deleteCaixasDasLojas(supabase, lojaIds)
    await deleteUsuariosCap(supabase)
    await deleteWhereIn(supabase, 'lojas', 'id', lojaIds)
  } else {
    await deleteUsuariosCap(supabase)
  }

  console.log('[reset-capacity] concluído (somente sintéticos)')
}

async function deleteWhereIn(supabase, table, column, ids) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .in(column, ids)
  if (error) {
    console.warn(`[reset-capacity] ${table}: ${error.message}`)
    return
  }
  console.log(`[reset-capacity] ${table}: ${count ?? '?'} removidos`)
}

async function deleteCaixasDasLojas(supabase, lojaIds) {
  const { data: caixas } = await supabase
    .from('caixas')
    .select('id')
    .in('loja_id', lojaIds)
  const ids = (caixas || []).map((c) => c.id)
  if (ids.length === 0) return

  // Vendas ligadas a esses caixas (sintéticos de carga)
  const { data: vendas } = await supabase.from('vendas').select('id').in('caixa_id', ids)
  const vendaIds = (vendas || []).map((v) => v.id)
  if (vendaIds.length > 0) {
    await deleteWhereIn(supabase, 'itens_venda', 'venda_id', vendaIds)
    await deleteWhereIn(supabase, 'vendas_pagamentos', 'venda_id', vendaIds)
    await deleteWhereIn(supabase, 'vendas', 'id', vendaIds)
  }
  await deleteWhereIn(supabase, 'caixas', 'id', ids)
}

async function deleteUsuariosCap(supabase) {
  const domain = CAPACITY_EMAIL_DOMAIN.toLowerCase()
  for (let page = 1; page <= 50; page += 1) {
    const { data: list, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const targets = list.users.filter((u) =>
      (u.email || '').toLowerCase().endsWith(`@${domain}`),
    )
    for (const u of targets) {
      await supabase.from('usuarios').delete().eq('id', u.id)
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id)
      if (delErr) console.warn(`[reset-capacity] auth ${u.email}: ${delErr.message}`)
      else console.log(`[reset-capacity] auth removido: ${u.email}`)
    }
    if ((list.users?.length ?? 0) < 200) break
  }
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
