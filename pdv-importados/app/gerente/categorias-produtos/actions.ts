'use server'

import { z } from 'zod'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  type CadastroActionResult,
  zodValidationError,
  alternarAtivoCadastro,
  criarCadastro,
  atualizarCadastro,
  listarCadastro,
} from '../shared/actionHelpers'
import type { CategoriaProdutoRow } from './categoriasProdutosTypes'

const REVALIDATE_PATH = '/gerente/categorias-produtos'
const TABELA = 'categorias'

type ActionResult<T> = CadastroActionResult<T>

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

function toRow(r: Record<string, unknown>): CategoriaProdutoRow {
  return {
    id: r.id as string,
    nome: r.nome as string,
    ativo: Boolean(r.ativo),
    categoria_pai_id: (r.categoria_pai_id as string | null) ?? null,
    qtd_produtos: Number(r.qtd_produtos ?? 0),
    created_at: r.created_at as string,
  }
}

export async function listarCategoriasProdutos(
  input: unknown,
): Promise<ActionResult<{ rows: CategoriaProdutoRow[]; total: number }>> {
  return listarCadastro(input, ListarCategoriasSchema, {
    tabela: TABELA,
    selectCols: 'id, nome, ativo, categoria_pai_id, created_at',
    secaoErro: 'Categorias',
    toRow,
    postProcess: async (rows, supabase) => {
      const ids = rows.map((r) => r.id)
      if (ids.length === 0) return rows
      const counts = await Promise.all(
        ids.map((catId) =>
          supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('categoria_id', catId)
            .then(({ count }) => [catId, count ?? 0] as const),
        ),
      )
      const qtdMap: Record<string, number> = {}
      for (const [catId, qtd] of counts) qtdMap[catId] = qtd
      return rows.map((r) => ({ ...r, qtd_produtos: qtdMap[r.id] ?? 0 }))
    },
  })
}

export async function criarCategoriaProduto(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = NovaCategoriaSchema.safeParse(input)
  if (!parsed.success) return zodValidationError(parsed.error.issues)
  const result = await criarCadastro(TABELA, { nome: parsed.data.nome.trim(), ativo: true }, 'Criar categoria', [REVALIDATE_PATH, '/gerente/produtos'])
  if (result.success) revalidateTag('catalogo-opcoes-filtro')
  return result
}

export async function atualizarCategoriaProduto(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = AtualizarCategoriaSchema.safeParse(input)
  if (!parsed.success) return zodValidationError(parsed.error.issues)
  return atualizarCadastro(TABELA, parsed.data.id, { nome: parsed.data.nome.trim() }, 'Atualizar categoria', [REVALIDATE_PATH, '/gerente/produtos'])
}

export async function alternarAtivoCategoriaProduto(
  id: string,
  ativo: boolean,
): Promise<ActionResult<null>> {
  return alternarAtivoCadastro(TABELA, id, ativo, [REVALIDATE_PATH, '/gerente/produtos'])
}

export async function excluirCategoriaProduto(
  id: string,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
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
  revalidateTag('catalogo-opcoes-filtro')
  return { success: true, data: null }
}
