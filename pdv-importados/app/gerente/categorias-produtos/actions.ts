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
import type { CategoriaProdutoRow } from './categoriasProdutosTypes'

const REVALIDATE_PATH = '/gerente/categorias-produtos'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Schemas ─────────────────────────────────────────────────────────────────

const NovaCategoriaSchema = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(120),
})

const AtualizarCategoriaSchema = z.object({
  id: z.string().uuid('ID inválido.'),
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(120),
})

const ListarCategoriasSchema = z.object({
  situacao: z.enum(['todos', 'ativos', 'inativos']).default('todos'),
  busca: z.string().max(200).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type ListarCategoriasInput = z.infer<typeof ListarCategoriasSchema>

// ─── Helpers ─────────────────────────────────────────────────────────────────

type DbCategoriaRow = {
  id: string
  nome: string
  ativo: boolean
  categoria_pai_id: string | null
  created_at: string
  qtd_produtos: number
}

function toRow(r: DbCategoriaRow): CategoriaProdutoRow {
  return {
    id: r.id,
    nome: r.nome,
    ativo: Boolean(r.ativo),
    categoria_pai_id: r.categoria_pai_id ?? null,
    qtd_produtos: Number(r.qtd_produtos ?? 0),
    created_at: r.created_at,
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function listarCategoriasProdutos(
  input: unknown,
): Promise<ActionResult<{ rows: CategoriaProdutoRow[]; total: number }>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = ListarCategoriasSchema.safeParse(input)
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

  const { situacao, busca, page, pageSize } = parsed.data
  const supabase = await createClient()

  let query = supabase
    .from('categorias')
    .select('id, nome, ativo, categoria_pai_id, created_at', { count: 'exact' })

  if (situacao === 'ativos') query = query.eq('ativo', true)
  else if (situacao === 'inativos') query = query.eq('ativo', false)

  if (busca.trim()) {
    query = query.ilike('nome', `%${busca.trim()}%`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await query
    .order('nome', { ascending: true })
    .range(from, to)

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Categorias', error.message),
    }
  }

  // Contar produtos vinculados por categoria usando count (evita limite de 1000 linhas do PostgREST)
  const ids = (data ?? []).map((r) => r.id)
  const produtosPorCategoria: Record<string, number> = {}

  if (ids.length > 0) {
    const countPromises = ids.map((catId) =>
      supabase
        .from('produtos')
        .select('id', { count: 'exact', head: true })
        .eq('categoria_id', catId)
        .then(({ count }) => [catId, count ?? 0] as const),
    )
    const results = await Promise.all(countPromises)
    for (const [catId, qtd] of results) {
      produtosPorCategoria[catId] = qtd
    }
  }

  const rows: CategoriaProdutoRow[] = (data ?? []).map((r) =>
    toRow({ ...r, qtd_produtos: produtosPorCategoria[r.id] ?? 0 }),
  )

  return { success: true, data: { rows, total: count ?? 0 } }
}

export async function criarCategoriaProduto(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = NovaCategoriaSchema.safeParse(input)
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
    .from('categorias')
    .insert({ nome: parsed.data.nome.trim(), ativo: true })
    .select('id')
    .single()

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Criar categoria', error.message),
    }
  }

  revalidatePath(REVALIDATE_PATH)
  revalidatePath('/gerente/produtos')
  return { success: true, data: { id: (data as { id: string }).id } }
}

export async function atualizarCategoriaProduto(
  input: unknown,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = AtualizarCategoriaSchema.safeParse(input)
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
    .from('categorias')
    .update({ nome: parsed.data.nome.trim() })
    .eq('id', parsed.data.id)

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Atualizar categoria', error.message),
    }
  }

  revalidatePath(REVALIDATE_PATH)
  revalidatePath('/gerente/produtos')
  return { success: true, data: null }
}

export async function alternarAtivoCategoriaProduto(
  id: string,
  ativo: boolean,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return { success: false, error: 'ID inválido.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('categorias')
    .update({ ativo })
    .eq('id', idParsed.data)

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Alterar situação', error.message),
    }
  }

  revalidatePath(REVALIDATE_PATH)
  revalidatePath('/gerente/produtos')
  return { success: true, data: null }
}

export async function excluirCategoriaProduto(
  id: string,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return { success: false, error: 'ID inválido.' }
  }

  const supabase = await createClient()

  // Bloquear exclusão se houver produtos vinculados
  const { count } = await supabase
    .from('produtos')
    .select('id', { count: 'exact', head: true })
    .eq('categoria_id', idParsed.data)

  if ((count ?? 0) > 0) {
    return {
      success: false,
      error: `Não é possível excluir: categoria possui ${count} produto(s) vinculado(s). Inative-a ou reatribua os produtos antes.`,
    }
  }

  const { error } = await supabase
    .from('categorias')
    .delete()
    .eq('id', idParsed.data)

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Excluir categoria', error.message),
    }
  }

  revalidatePath(REVALIDATE_PATH)
  revalidatePath('/gerente/produtos')
  return { success: true, data: null }
}
