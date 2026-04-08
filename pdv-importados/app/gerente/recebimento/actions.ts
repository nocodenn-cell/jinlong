'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

export function validarRemessaInput(input: {
  origem: string
  itens: Array<{ produto_id: string; quantidade_esperada: number; quantidade_conferida: number }>
}): string | null {
  const origem = input.origem.trim()
  if (!origem) return 'Informe a origem da remessa.'
  if (!input.itens?.length) return 'Inclua ao menos um item.'
  for (const it of input.itens) {
    if (!it.produto_id?.trim()) return 'Produto inválido na remessa.'
    if (!Number.isFinite(it.quantidade_esperada) || it.quantidade_esperada < 0) {
      return 'Quantidade esperada inválida.'
    }
    if (!Number.isFinite(it.quantidade_conferida) || it.quantidade_conferida < 0) {
      return 'Quantidade conferida inválida.'
    }
  }
  return null
}

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
  if (!lojaId) return { success: false, error: 'Sessão inválida' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Sessão inválida' }

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

  if (e1 || !rem) return { success: false, error: e1?.message ?? 'Erro ao criar remessa' }

  const rows = input.itens.map((i) => ({
    remessa_id: rem.id,
    produto_id: i.produto_id,
    quantidade_esperada: i.quantidade_esperada,
    quantidade_conferida: i.quantidade_conferida,
  }))

  const { error: e2 } = await supabase.from('remessa_itens').insert(rows)
  if (e2) return { success: false, error: e2.message }

  const { error: e3 } = await supabase.rpc('confirmar_remessa_entrada', {
    p_remessa_id: rem.id,
  })
  if (e3) return { success: false, error: e3.message }

  revalidatePath('/gerente/recebimento')
  revalidatePath('/gerente/estoque')
  return { success: true, data: rem.id }
}
