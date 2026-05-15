'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'
import type { CategoriaFinanceiraRow, CategoriaFinanceiraTipo } from './categoriasFinanceirasTypes'

const REVALIDATE_PATH = '/gerente/categorias-financeiras'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Schemas ─────────────────────────────────────────────────────────────────

const TIPOS_VALIDOS = ['RECEITA', 'DESPESA', 'AMBOS'] as const

const NovaCategoriaFinSchema = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(120),
  tipo: z.enum(TIPOS_VALIDOS),
})

const AtualizarCategoriaFinSchema = z.object({
  id: z.string().uuid('ID inválido.'),
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(120),
  tipo: z.enum(TIPOS_VALIDOS),
})

const ListarCategoriasFinSchema = z.object({
  tipo: z.enum(['todos', 'RECEITA', 'DESPESA', 'AMBOS']).default('todos'),
  situacao: z.enum(['todos', 'ativos', 'inativos']).default('todos'),
  busca: z.string().max(200).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type ListarCategoriasFinInput = z.infer<typeof ListarCategoriasFinSchema>

// ─── Helper ───────────────────────────────────────────────────────────────────

type DbRow = {
  id: string
  nome: string
  tipo: string
  ativo: boolean
  created_at: string
}

function toRow(r: DbRow): CategoriaFinanceiraRow {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo as CategoriaFinanceiraTipo,
    ativo: Boolean(r.ativo),
    created_at: r.created_at,
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function listarCategoriasFinanceiras(
  input: unknown,
): Promise<ActionResult<{ rows: CategoriaFinanceiraRow[]; total: number }>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = ListarCategoriasFinSchema.safeParse(input)
  if (!parsed.success) {
    const { idioma } = await getUsuarioIdioma()
    return {
      success: false,
      error: mensagemErroValidacaoZod(
        parsed.error.issues.map((i: { message: string }) => i.message).join('; '),
        idioma,
      ),
    }
  }

  const { tipo, situacao, busca, page, pageSize } = parsed.data
  const supabase = await createClient()

  let query = supabase
    .from('categorias_financeiras')
    .select('id, nome, tipo, ativo, created_at', { count: 'exact' })

  if (tipo !== 'todos') query = query.eq('tipo', tipo)
  if (situacao === 'ativos') query = query.eq('ativo', true)
  else if (situacao === 'inativos') query = query.eq('ativo', false)
  if (busca.trim()) query = query.ilike('nome', `%${busca.trim()}%`)

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await query
    .order('nome', { ascending: true })
    .range(from, to)

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Categorias Financeiras', error.message),
    }
  }

  const rows = (data ?? []).map((r: DbRow) => toRow(r))
  return { success: true, data: { rows, total: count ?? 0 } }
}

export async function criarCategoriaFinanceira(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = NovaCategoriaFinSchema.safeParse(input)
  if (!parsed.success) {
    const { idioma } = await getUsuarioIdioma()
    return {
      success: false,
      error: mensagemErroValidacaoZod(
        parsed.error.issues.map((i: { message: string }) => i.message).join('; '),
        idioma,
      ),
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorias_financeiras')
    .insert({ nome: parsed.data.nome.trim(), tipo: parsed.data.tipo, ativo: true })
    .select('id')
    .single()

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Criar categoria financeira', error.message),
    }
  }

  revalidatePath(REVALIDATE_PATH)
  return { success: true, data: { id: (data as { id: string }).id } }
}

export async function atualizarCategoriaFinanceira(
  input: unknown,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = AtualizarCategoriaFinSchema.safeParse(input)
  if (!parsed.success) {
    const { idioma } = await getUsuarioIdioma()
    return {
      success: false,
      error: mensagemErroValidacaoZod(
        parsed.error.issues.map((i: { message: string }) => i.message).join('; '),
        idioma,
      ),
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('categorias_financeiras')
    .update({ nome: parsed.data.nome.trim(), tipo: parsed.data.tipo })
    .eq('id', parsed.data.id)

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Atualizar categoria financeira', error.message),
    }
  }

  revalidatePath(REVALIDATE_PATH)
  return { success: true, data: null }
}

export async function alternarAtivoCategoriaFinanceira(
  id: string,
  ativo: boolean,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) return { success: false, error: 'ID inválido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('categorias_financeiras')
    .update({ ativo })
    .eq('id', idParsed.data)

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Alterar situação', error.message),
    }
  }

  revalidatePath(REVALIDATE_PATH)
  return { success: true, data: null }
}

export async function excluirCategoriaFinanceira(
  id: string,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) return { success: false, error: 'ID inválido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('categorias_financeiras')
    .delete()
    .eq('id', idParsed.data)

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Excluir categoria financeira', error.message),
    }
  }

  revalidatePath(REVALIDATE_PATH)
  return { success: true, data: null }
}
