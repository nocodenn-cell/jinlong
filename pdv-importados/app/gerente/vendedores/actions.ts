'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  somenteDigitos,
  validarCelularVendedorOpcional,
  validarCodigoVendedor,
  validarCpfVendedorOpcional,
  validarNomeVendedor,
} from './actions.validation'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

function revalidateVendedores() {
  revalidatePath('/gerente/vendedores')
}

function normNullableDigits(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === '') return null
  const d = somenteDigitos(raw)
  return d === '' ? null : d
}

export async function criarVendedor(input: {
  codigo: string
  nome: string
  cpf?: string
  celular?: string
}): Promise<R<string>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const e1 = validarCodigoVendedor(input.codigo)
  if (e1) return { success: false, error: e1 }
  const e2 = validarNomeVendedor(input.nome)
  if (e2) return { success: false, error: e2 }
  const e3 = validarCpfVendedorOpcional(input.cpf)
  if (e3) return { success: false, error: e3 }
  const e4 = validarCelularVendedorOpcional(input.celular)
  if (e4) return { success: false, error: e4 }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vendedores')
    .insert({
      codigo: input.codigo.trim(),
      nome: input.nome.trim(),
      cpf: normNullableDigits(input.cpf),
      celular: normNullableDigits(input.celular),
    })
    .select('id')
    .single()

  if (error || !data) {
    const msg = error?.code === '23505' ? 'Já existe vendedor com este código.' : error?.message ?? 'Falha ao criar vendedor.'
    return { success: false, error: mensagemErroComSecao('Vendedor', msg) }
  }
  revalidateVendedores()
  return { success: true, data: data.id as string }
}

export async function atualizarVendedor(input: {
  id: string
  codigo: string
  nome: string
  cpf?: string
  celular?: string
  ativo: boolean
}): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const e1 = validarCodigoVendedor(input.codigo)
  if (e1) return { success: false, error: e1 }
  const e2 = validarNomeVendedor(input.nome)
  if (e2) return { success: false, error: e2 }
  const e3 = validarCpfVendedorOpcional(input.cpf)
  if (e3) return { success: false, error: e3 }
  const e4 = validarCelularVendedorOpcional(input.celular)
  if (e4) return { success: false, error: e4 }

  const supabase = await createClient()
  const { error } = await supabase
    .from('vendedores')
    .update({
      codigo: input.codigo.trim(),
      nome: input.nome.trim(),
      cpf: normNullableDigits(input.cpf),
      celular: normNullableDigits(input.celular),
      ativo: input.ativo,
    })
    .eq('id', input.id)

  if (error) {
    const msg = error.code === '23505' ? 'Já existe vendedor com este código.' : error.message
    return { success: false, error: mensagemErroComSecao('Vendedor', msg) }
  }
  revalidateVendedores()
  return { success: true, data: null }
}

export async function excluirVendedor(id: string): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!id?.trim()) return { success: false, error: 'Identificador inválido.' }

  const supabase = await createClient()
  const { error } = await supabase.from('vendedores').delete().eq('id', id)
  if (error) return { success: false, error: mensagemErroComSecao('Vendedor', error.message) }
  revalidateVendedores()
  return { success: true, data: null }
}
