'use server'

import { z } from 'zod'
import { revalidatePath, revalidateTag } from 'next/cache'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { createClient } from '@/lib/supabase/server'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  type CadastroActionResult,
  zodValidationError,
  alternarAtivoCadastro,
  atualizarCadastro,
  criarCadastro,
  listarCadastro,
} from '../shared/actionHelpers'

const REVALIDATE_PATHS = ['/gerente/produtos', '/admin/catalogo', '/admin/marcas-produtos'] as const
const TABELA = 'marcas'

type ActionResult<T> = CadastroActionResult<T>

export type MarcaProdutoRow = {
  id: string
  nome: string
  ativo: boolean
  qtd_produtos: number
  created_at: string | null
}

const NovaMarcaSchema = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(120),
})

const AtualizarMarcaSchema = z.object({
  id: z.string().uuid('ID inválido.'),
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(120),
})

const ListarMarcasSchema = z.object({
  situacao: z.enum(['todos', 'ativos', 'inativos']).default('todos'),
  busca: z.string().max(200).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

function revalidateMarcaPaths() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p)
  revalidateTag('catalogo-opcoes-filtro')
}

export async function criarMarcaProduto(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = NovaMarcaSchema.safeParse(input)
  if (!parsed.success) return zodValidationError(parsed.error.issues)

  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const result = await criarCadastro(
    TABELA,
    { nome: parsed.data.nome.trim(), ativo: true },
    'Criar marca',
    [...REVALIDATE_PATHS],
  )
  if (result.success) revalidateMarcaPaths()
  return result
}

function toRow(r: Record<string, unknown>): MarcaProdutoRow {
  return {
    id: r.id as string,
    nome: r.nome as string,
    ativo: Boolean(r.ativo),
    qtd_produtos: Number(r.qtd_produtos ?? 0),
    created_at: (r.created_at as string | null) ?? null,
  }
}

export async function listarMarcasProdutos(
  input: unknown,
): Promise<ActionResult<{ rows: MarcaProdutoRow[]; total: number }>> {
  return listarCadastro(input, ListarMarcasSchema, {
    tabela: TABELA,
    selectCols: 'id, nome, ativo, created_at',
    secaoErro: 'Marcas',
    toRow,
    postProcess: async (rows, supabase) => {
      if (rows.length === 0) return rows
      const counts = await Promise.all(
        rows.map((r) =>
          supabase
            .from('produtos')
            .select('id', { count: 'exact', head: true })
            .eq('marca_id', r.id)
            .then(({ count }) => [r.id, count ?? 0] as const),
        ),
      )
      const qtd = Object.fromEntries(counts)
      return rows.map((r) => ({ ...r, qtd_produtos: qtd[r.id] ?? 0 }))
    },
  })
}

export async function atualizarMarcaProduto(input: unknown): Promise<ActionResult<null>> {
  const parsed = AtualizarMarcaSchema.safeParse(input)
  if (!parsed.success) return zodValidationError(parsed.error.issues)

  const result = await atualizarCadastro(
    TABELA,
    parsed.data.id,
    { nome: parsed.data.nome.trim() },
    'Atualizar marca',
    [...REVALIDATE_PATHS],
  )
  if (result.success) revalidateMarcaPaths()
  return result
}

/**
 * Inativar tira a marca das escolhas novas; produtos já vinculados mantêm o
 * vínculo (as opções do catálogo já filtram `ativo = true` para marcas).
 */
export async function alternarAtivoMarcaProduto(
  id: string,
  ativo: boolean,
): Promise<ActionResult<null>> {
  const result = await alternarAtivoCadastro(TABELA, id, ativo, [...REVALIDATE_PATHS])
  if (result.success) revalidateMarcaPaths()
  return result
}

/**
 * Exclusão física só quando não há produto vinculado — mesma proteção usada em
 * categorias. Com produtos vinculados o caminho é inativar.
 */
export async function excluirMarcaProduto(id: string): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) return { success: false, error: 'ID inválido.' }

  const supabase = await createClient()
  const { count } = await supabase
    .from('produtos')
    .select('id', { count: 'exact', head: true })
    .eq('marca_id', idParsed.data)

  if ((count ?? 0) > 0) {
    return {
      success: false,
      error: `Não é possível excluir: marca possui ${count} produto(s) vinculado(s). Inative-a ou reatribua os produtos antes.`,
    }
  }

  const { error } = await supabase.from('marcas').delete().eq('id', idParsed.data)
  if (error) {
    return { success: false, error: mensagemErroComSecao('Excluir marca', error.message) }
  }

  revalidateMarcaPaths()
  return { success: true, data: null }
}
