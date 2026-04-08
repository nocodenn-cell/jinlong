'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

export async function criarCliente(input: { nome: string; documento?: string; telefone?: string }): Promise<R<string>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const nome = input.nome.trim()
  if (!nome) return { success: false, error: 'Nome obrigatório' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nome,
      documento: input.documento?.trim() || null,
      telefone: input.telefone?.trim() || null,
    })
    .select('id')
    .single()
  if (error || !data) return { success: false, error: error?.message ?? 'Erro ao criar cliente' }
  revalidatePath('/gerente/financeiro')
  return { success: true, data: data.id as string }
}

export async function criarTituloReceber(input: {
  cliente_id: string
  valor_total: number
  descricao?: string
  vencimento?: string
}): Promise<R<string>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!input.valor_total || input.valor_total <= 0) return { success: false, error: 'Valor inválido' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contas_receber')
    .insert({
      cliente_id: input.cliente_id,
      valor_total: input.valor_total,
      valor_aberto: input.valor_total,
      descricao: input.descricao?.trim() || null,
      vencimento: input.vencimento?.trim() || null,
      status: 'ABERTO',
    })
    .select('id')
    .single()
  if (error || !data) return { success: false, error: error?.message ?? 'Erro ao criar título' }
  revalidatePath('/gerente/financeiro')
  return { success: true, data: data.id as string }
}

export async function liquidarTitulo(input: {
  titulo_id: string
  valor: number
  forma_pagamento: 'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'OUTROS'
}): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { error } = await supabase.rpc('registrar_liquidacao_receber', {
    p_titulo_id: input.titulo_id,
    p_valor: input.valor,
    p_forma_pagamento: input.forma_pagamento,
    p_observacao: null,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/gerente/financeiro')
  return { success: true, data: null }
}

export async function enfileirarDocFiscalStub(venda_id: string): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const supabase = await createClient()
  const { error } = await supabase.from('documentos_fiscais_pendentes').insert({
    venda_id,
    tipo_doc: 'NFC_E_STUB',
    status: 'PENDENTE',
    payload: { origem: 'painel_gerente' },
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/gerente/financeiro')
  return { success: true, data: null }
}
