import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { linhasFormasPagamentoPadrao, PDV_CONFIG_DEFAULTS } from '@/lib/provisionamento/provisionamentoDefaults'

type Loose = {
  from: (t: string) => {
    select: (c: string) => { eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> } } & Promise<{ data: { id: number }[] | null; error: { message: string } | null }>
    insert: (r: unknown) => Promise<{ error: { message: string } | null }>
    upsert: (r: unknown, o: unknown) => Promise<{ error: { message: string } | null }>
  }
}

/**
 * Mesmo bootstrap pós-RPC do wizard de provisionamento (PR #584): config PDV + formas de pagamento.
 * Duplicado aqui de propósito para não mexer no módulo 'use server' do wizard (funções exportadas
 * de 'use server' viram endpoints). TODO: extrair para módulo comum quando o #584 for mergeado.
 */
export async function bootstrapLojaTrial(admin: SupabaseClient, lojaId: string, donoId: string, idioma: 'pt' | 'zh') {
  const db = admin as unknown as Loose
  const { data: existing } = await db.from('pdv_config').select('id').eq('loja_id', lojaId).maybeSingle()
  if (!existing) {
    const { data: ids, error: idErr } = await db.from('pdv_config').select('id')
    if (idErr) throw new Error(idErr.message)
    const id = (ids ?? []).reduce((acc, r) => Math.max(acc, Number(r.id) || 0), 0) + 1
    const { error } = await db.from('pdv_config').insert({
      id, loja_id: lojaId, gerente_id: donoId, ...PDV_CONFIG_DEFAULTS, idioma_padrao: idioma,
    })
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message)
  }
  const { error } = await db.from('formas_pagamento').upsert(linhasFormasPagamentoPadrao(lojaId), {
    onConflict: 'loja_id,codigo', ignoreDuplicates: true,
  })
  if (error) throw new Error(error.message)
}
