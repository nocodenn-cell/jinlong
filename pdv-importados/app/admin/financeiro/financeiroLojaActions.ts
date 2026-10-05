'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertAdminSession } from '@/lib/admin/auth/assertAdminSession'
import { FINANCEIRO_OPERACOES, type FinanceiroPainel } from './financeiroLojaTypes'

const commandSchema = z.object({ tipo: z.enum(FINANCEIRO_OPERACOES), dados: z.record(z.unknown()), requestId: z.string().uuid() })
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export async function buscarCandidatosConciliacao(extrato: string, busca = ''): Promise<{ ok: true; data: { id:string; data:string; descricao:string; valor:number }[] } | { ok:false; error:string }> {
 const auth = await assertAdminSession(undefined, { resource: 'sensitive:financeiro' })
 if (!auth.ok) return auth
 if (!z.string().uuid().safeParse(extrato).success || busca.length>120) return { ok:false,error:'Extrato ou busca inválidos.' }
 const supabase = await createClient()
 const { data,error } = await supabase.rpc('financeiro_candidatos_conciliacao',{ p_extrato:extrato,p_busca:busca })
 if (error) return { ok:false,error:error.message }
 return { ok:true,data:data as { id:string; data:string; descricao:string; valor:number }[] }
}

export async function carregarFinanceiroLoja(de: string, ate: string, pagina = 1): Promise<{ ok: true; data: FinanceiroPainel } | { ok: false; error: string }> {
 const auth = await assertAdminSession(undefined, { resource: 'sensitive:financeiro' })
 if (!auth.ok) return auth
 if (!dateSchema.safeParse(de).success || !dateSchema.safeParse(ate).success || !Number.isInteger(pagina) || pagina < 1) return { ok: false, error: 'Período ou página inválidos.' }
 const supabase = await createClient()
 const { data, error } = await supabase.rpc('financeiro_painel', { p_de: de, p_ate: ate, p_pagina: pagina })
 if (error) return { ok: false, error: error.code === 'PGRST202' ? 'A atualização do banco financeiro ainda não foi aplicada. As rotinas anteriores continuam disponíveis.' : error.message }
 return { ok: true, data: data as FinanceiroPainel }
}

export async function executarFinanceiroLoja(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
 const auth = await assertAdminSession(undefined, { resource: 'sensitive:financeiro' })
 if (!auth.ok) return auth
 const parsed = commandSchema.safeParse(input)
 if (!parsed.success) return { ok: false, error: 'Dados da operação inválidos.' }
 const supabase = await createClient()
 const { error } = await supabase.rpc('financeiro_comando', { p_tipo: parsed.data.tipo, p_dados: parsed.data.dados, p_request_id: parsed.data.requestId })
 if (error) return { ok: false, error: error.message }
 revalidatePath('/admin/financeiro')
 revalidatePath('/admin/caixas')
 return { ok: true }
}
