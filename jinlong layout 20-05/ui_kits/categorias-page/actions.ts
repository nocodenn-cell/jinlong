'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

export type CategoriaRow = {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  produtos_count: number
  criado_em: string | null
}

export type CategoriaInput = {
  id?: string
  nome: string
  descricao: string | null
  ativo: boolean
}

const COLUMNS = `id, nome, descricao, ativo, criado_em`

export async function listarCategoriasAction(): Promise<
  { ok: true; categorias: CategoriaRow[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('categorias')
      .select(COLUMNS)
      .order('nome', { ascending: true })
    if (error) return { ok: false, error: error.message }

    const cats = (data ?? []) as Array<Omit<CategoriaRow, 'produtos_count'>>
    if (cats.length === 0) return { ok: true, categorias: [] }

    // Conta produtos por categoria via aggregate (uma chamada por categoria
    // seria O(n) chamadas — vamos buscar em batch).
    const ids = cats.map((c) => c.id)
    const { data: counts } = await supabase
      .from('produtos')
      .select('categoria_id')
      .in('categoria_id', ids)

    const tally = new Map<string, number>()
    for (const row of counts ?? []) {
      const k = (row as { categoria_id: string }).categoria_id
      tally.set(k, (tally.get(k) ?? 0) + 1)
    }

    return {
      ok: true,
      categorias: cats.map((c) => ({ ...c, produtos_count: tally.get(c.id) ?? 0 })),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao listar categorias.' }
  }
}

function validar(input: CategoriaInput): string | null {
  if (!input.nome || input.nome.trim().length < 2) return 'Nome inválido.'
  if (input.nome.trim().length > 60) return 'Nome muito longo (máx. 60 caracteres).'
  if (input.descricao && input.descricao.length > 200) return 'Descrição muito longa (máx. 200).'
  return null
}

export async function salvarCategoriaAction(
  input: CategoriaInput,
): Promise<{ ok: true; categoria: CategoriaRow } | { ok: false; error: string }> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { ok: false, error: auth.error }
  const err = validar(input)
  if (err) return { ok: false, error: err }

  try {
    const supabase = await createClient()
    const payload = {
      nome: input.nome.trim(),
      descricao: input.descricao?.trim() || null,
      ativo: input.ativo,
    }
    const query = input.id
      ? supabase.from('categorias').update(payload).eq('id', input.id).select(COLUMNS).single()
      : supabase.from('categorias').insert({ ...payload }).select(COLUMNS).single()
    const { data, error } = await query
    if (error) {
      if (error.code === '23505') {
        return { ok: false, error: 'Já existe uma categoria com este nome.' }
      }
      return { ok: false, error: mensagemErroComSecao('Categoria', error.message) }
    }
    revalidatePath('/gerente/categorias')
    return {
      ok: true,
      categoria: { ...(data as Omit<CategoriaRow, 'produtos_count'>), produtos_count: 0 },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao salvar categoria.' }
  }
}

export async function excluirCategoriaAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()
    const { count, error: countErr } = await supabase
      .from('produtos')
      .select('id', { count: 'exact', head: true })
      .eq('categoria_id', id)
    if (countErr) return { ok: false, error: countErr.message }
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: `Não é possível excluir: existem ${count} produto(s) vinculado(s) a esta categoria.`,
      }
    }

    const { error } = await supabase.from('categorias').delete().eq('id', id)
    if (error) return { ok: false, error: mensagemErroComSecao('Categoria', error.message) }
    revalidatePath('/gerente/categorias')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao excluir categoria.' }
  }
}
