'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { categoriaValidacao } from './actions.validation'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

function revalidateCategorias() {
  revalidatePath('/gerente/categorias')
}

export async function criarCategoria(input: { nome: string; categoria_pai_id?: string | null }): Promise<R<string>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const parsed = categoriaValidacao({ ...input, ativo: true })
  if (!parsed.ok) return { success: false, error: parsed.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorias')
    .insert({
      nome: parsed.value.nome,
      categoria_pai_id: parsed.value.categoria_pai_id ?? null,
      ativo: true,
    })
    .select('id')
    .single()

  if (error || !data) {
    return {
      success: false,
      error: mensagemErroComSecao('Categoria', error?.message ?? 'Falha ao criar categoria.'),
    }
  }
  revalidateCategorias()
  return { success: true, data: data.id as string }
}

export async function atualizarCategoria(input: {
  id: string
  nome: string
  categoria_pai_id?: string | null
  ativo: boolean
}): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const parsed = categoriaValidacao({ nome: input.nome, categoria_pai_id: input.categoria_pai_id ?? undefined, ativo: input.ativo })
  if (!parsed.ok) return { success: false, error: parsed.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('categorias')
    .update({
      nome: parsed.value.nome,
      categoria_pai_id: parsed.value.categoria_pai_id ?? null,
      ativo: parsed.value.ativo,
    })
    .eq('id', input.id)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Categoria', error.message) }
  }
  revalidateCategorias()
  return { success: true, data: null }
}

export async function excluirCategoria(id: string): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!id?.trim()) return { success: false, error: 'Identificador inválido.' }

  const supabase = await createClient()
  const { error } = await supabase.from('categorias').delete().eq('id', id)
  if (error) {
    return { success: false, error: mensagemErroComSecao('Categoria', error.message) }
  }
  revalidateCategorias()
  return { success: true, data: null }
}

