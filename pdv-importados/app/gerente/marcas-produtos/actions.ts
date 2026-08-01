'use server'

import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { revalidarDominio } from '@/lib/navigation/revalidarDominio'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import {
  type CadastroActionResult,
  zodValidationError,
  alternarAtivoCadastro,
  atualizarCadastro,
  criarCadastro,
  listarCadastro,
} from '../shared/actionHelpers'

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
  revalidarDominio('marca.alterada')
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
    ['marca.alterada'],
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
    ['marca.alterada'],
  )
  if (result.success) revalidateMarcaPaths()
  return result
}

/**
 * Inativar tira a marca das escolhas NOVAS; o produto que já a usa continua
 * exibindo e gravando o vínculo, porque `opcoes.marcas` carrega a flag `ativo`
 * e o formulário resolve por `opcoesSelecionaveis`. Mesma regra da categoria —
 * ver Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md.
 *
 * Não existe exclusão de marca: com produtos vinculados ela seria recusada de
 * qualquer forma, e sem vínculo inativar já resolve. Uma Server Action é
 * endpoint público, então a que não tem tela não é criada.
 */
export async function alternarAtivoMarcaProduto(
  id: string,
  ativo: boolean,
): Promise<ActionResult<null>> {
  const result = await alternarAtivoCadastro(TABELA, id, ativo, ['marca.alterada'])
  if (result.success) revalidateMarcaPaths()
  return result
}
