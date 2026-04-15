'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { validarRemessaInput } from './actions.validation'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

async function lojaDoUsuario(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('loja_id')
    .eq('id', user.id)
    .maybeSingle()
  return (data?.loja_id as string | undefined) ?? LOJA_MATRIZ_ID
}

export async function criarRemessaConferencia(input: {
  origem: string
  observacao?: string
  itens: Array<{ produto_id: string; quantidade_esperada: number; quantidade_conferida: number }>
}): Promise<R<string>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja. Faça login novamente.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Faça login novamente para registrar a remessa.' }

  const erro = validarRemessaInput({
    origem: input.origem,
    itens: input.itens,
  })
  if (erro) return { success: false, error: erro }
  const origem = input.origem.trim()

  const { data: rem, error: e1 } = await supabase
    .from('remessas')
    .insert({
      loja_id: lojaId,
      origem_descricao: origem,
      status: 'EM_CONFERENCIA',
      observacao: input.observacao?.trim() || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (e1 || !rem) {
    return {
      success: false,
      error: e1
        ? mensagemErroComSecao('Remessa', e1.message)
        : 'Não foi possível criar a remessa. Tente de novo.',
    }
  }

  const rows = input.itens.map((i) => ({
    remessa_id: rem.id,
    produto_id: i.produto_id,
    quantidade_esperada: i.quantidade_esperada,
    quantidade_conferida: i.quantidade_conferida,
  }))

  const { error: e2 } = await supabase.from('remessa_itens').insert(rows)
  if (e2) return { success: false, error: mensagemErroComSecao('Itens da remessa', e2.message) }

  const { error: e3 } = await supabase.rpc('confirmar_remessa_entrada', {
    p_remessa_id: rem.id,
  })
  if (e3) return { success: false, error: mensagemErroComSecao('Confirmação da remessa', e3.message) }

  revalidatePath('/gerente/recebimento')
  revalidatePath('/gerente/estoque')
  return { success: true, data: rem.id }
}
