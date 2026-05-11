'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  somenteDigitos,
  validarCnpjFornecedor,
  validarDocumentoClienteOpcional,
  validarNomeContato,
} from './actions.validation'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

function revalidateContatos() {
  revalidatePath('/gerente/clientes-fornecedores')
}

export async function atualizarClienteContato(input: {
  id: string
  nome: string
  documento?: string
  telefone?: string
  ativo: boolean
}): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const nomeErro = validarNomeContato(input.nome)
  if (nomeErro) return { success: false, error: nomeErro }
  const docErro = validarDocumentoClienteOpcional(input.documento)
  if (docErro) return { success: false, error: docErro }

  const supabase = await createClient()
  const docNorm =
    input.documento?.trim() === '' || input.documento === undefined
      ? null
      : somenteDigitos(input.documento)

  const { error } = await supabase
    .from('clientes')
    .update({
      nome: input.nome.trim(),
      documento: docNorm,
      telefone: input.telefone?.trim() || null,
      ativo: input.ativo,
    })
    .eq('id', input.id)

  if (error) return { success: false, error: mensagemErroComSecao('Cliente', error.message) }
  revalidateContatos()
  revalidatePath('/gerente/financeiro')
  return { success: true, data: null }
}

export async function criarFornecedorContato(input: { nome: string; cnpj: string }): Promise<R<string>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const nomeErro = validarNomeContato(input.nome)
  if (nomeErro) return { success: false, error: nomeErro }
  const cnpjErro = validarCnpjFornecedor(input.cnpj)
  if (cnpjErro) return { success: false, error: cnpjErro }

  const cnpj = somenteDigitos(input.cnpj)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fornecedores')
    .insert({ nome: input.nome.trim(), cnpj })
    .select('id')
    .single()

  if (error || !data) {
    const msg =
      error?.code === '23505' ? 'Já existe fornecedor com este CNPJ/CPF.' : error?.message ?? 'Falha ao criar fornecedor.'
    return { success: false, error: mensagemErroComSecao('Fornecedor', msg) }
  }
  revalidateContatos()
  return { success: true, data: data.id as string }
}

export async function atualizarFornecedorContato(input: { id: string; nome: string; cnpj: string }): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const nomeErro = validarNomeContato(input.nome)
  if (nomeErro) return { success: false, error: nomeErro }
  const cnpjErro = validarCnpjFornecedor(input.cnpj)
  if (cnpjErro) return { success: false, error: cnpjErro }

  const cnpj = somenteDigitos(input.cnpj)
  const supabase = await createClient()
  const { error } = await supabase.from('fornecedores').update({ nome: input.nome.trim(), cnpj }).eq('id', input.id)

  if (error) {
    const msg = error.code === '23505' ? 'Já existe fornecedor com este CNPJ/CPF.' : error.message
    return { success: false, error: mensagemErroComSecao('Fornecedor', msg) }
  }
  revalidateContatos()
  return { success: true, data: null }
}
