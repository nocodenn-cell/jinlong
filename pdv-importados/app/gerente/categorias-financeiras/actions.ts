'use server'

import { z } from 'zod'
import {
  type CadastroActionResult,
  zodValidationError,
  alternarAtivoCadastro,
  excluirCadastro,
  criarCadastro,
  atualizarCadastro,
  listarCadastro,
} from '../shared/actionHelpers'
import type { CategoriaFinanceiraRow, CategoriaFinanceiraTipo } from './categoriasFinanceirasTypes'

const REVALIDATE_PATHS = ['/gerente/categorias-financeiras', '/admin/categorias-financeiras', '/admin/financeiro']
const TABELA = 'categorias_financeiras'

type ActionResult<T> = CadastroActionResult<T>

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

function toRow(r: Record<string, unknown>): CategoriaFinanceiraRow {
  return {
    id: r.id as string,
    nome: r.nome as string,
    tipo: r.tipo as CategoriaFinanceiraTipo,
    ativo: Boolean(r.ativo),
    created_at: r.created_at as string,
  }
}

export async function listarCategoriasFinanceiras(
  input: unknown,
): Promise<ActionResult<{ rows: CategoriaFinanceiraRow[]; total: number }>> {
  return listarCadastro(input, ListarCategoriasFinSchema, {
    tabela: TABELA,
    selectCols: 'id, nome, tipo, ativo, created_at',
    secaoErro: 'Categorias Financeiras',
    toRow,
    extraFilters: (query, filtros) => {
      const tipo = filtros.tipo as string
      return tipo !== 'todos' ? query.eq('tipo', tipo) : query
    },
  })
}

export async function criarCategoriaFinanceira(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = NovaCategoriaFinSchema.safeParse(input)
  if (!parsed.success) return zodValidationError(parsed.error.issues)
  return criarCadastro(TABELA, { nome: parsed.data.nome.trim(), tipo: parsed.data.tipo, ativo: true }, 'Criar categoria financeira', REVALIDATE_PATHS)
}

export async function atualizarCategoriaFinanceira(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = AtualizarCategoriaFinSchema.safeParse(input)
  if (!parsed.success) return zodValidationError(parsed.error.issues)
  return atualizarCadastro(TABELA, parsed.data.id, { nome: parsed.data.nome.trim(), tipo: parsed.data.tipo }, 'Atualizar categoria financeira', REVALIDATE_PATHS)
}

export async function alternarAtivoCategoriaFinanceira(id: string, ativo: boolean): Promise<ActionResult<null>> {
  return alternarAtivoCadastro(TABELA, id, ativo, REVALIDATE_PATHS)
}

export async function excluirCategoriaFinanceira(id: string): Promise<ActionResult<null>> {
  return excluirCadastro(TABELA, id, 'Excluir categoria financeira', REVALIDATE_PATHS)
}
