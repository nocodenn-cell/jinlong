'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { formaPagamentoValidacao } from './actions.validation'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

function revalidateFormas() {
  revalidatePath('/gerente/formas-pagamento')
}

export async function criarFormaPagamento(input: {
  codigo: string
  descricao: string
  tipo: 'CARTAO' | 'DINHEIRO' | 'PIX' | 'BOLETO' | 'OUTRO'
}): Promise<R<string>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const parsed = formaPagamentoValidacao({ ...input, ativo: true })
  if (!parsed.ok) return { success: false, error: parsed.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('formas_pagamento')
    .insert(parsed.value)
    .select('id')
    .single()

  if (error || !data) {
    const msg =
      error?.code === '23505'
        ? 'Já existe forma de pagamento com este código.'
        : error?.message ?? 'Falha ao criar forma de pagamento.'
    return { success: false, error: mensagemErroComSecao('Forma de pagamento', msg) }
  }
  revalidateFormas()
  return { success: true, data: data.id as string }
}

export async function atualizarFormaPagamento(input: {
  id: string
  codigo: string
  descricao: string
  tipo: 'CARTAO' | 'DINHEIRO' | 'PIX' | 'BOLETO' | 'OUTRO'
  ativo: boolean
}): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const parsed = formaPagamentoValidacao(input)
  if (!parsed.ok) return { success: false, error: parsed.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('formas_pagamento')
    .update(parsed.value)
    .eq('id', input.id)

  if (error) {
    const msg = error.code === '23505' ? 'Já existe forma de pagamento com este código.' : error.message
    return { success: false, error: mensagemErroComSecao('Forma de pagamento', msg) }
  }
  revalidateFormas()
  return { success: true, data: null }
}

export async function excluirFormaPagamento(id: string): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!id?.trim()) return { success: false, error: 'Identificador inválido.' }

  const supabase = await createClient()
  const { error } = await supabase.from('formas_pagamento').delete().eq('id', id)
  if (error) {
    return { success: false, error: mensagemErroComSecao('Forma de pagamento', error.message) }
  }
  revalidateFormas()
  return { success: true, data: null }
}

