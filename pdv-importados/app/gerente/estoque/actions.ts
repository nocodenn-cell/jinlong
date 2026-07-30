'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'
import {
  actionFail,
  runServerActionWithObservability,
  type ActionResult,
} from '@/lib/observability/runServerAction'
import { AtualizarEstoqueSchema, EstoqueListagemInputSchema, ProdutoIdSchema } from './actions.validation'
import { ajustarComLinhaGarantida } from './ajusteComLinhaGarantida'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getGerenteLojaId } from '@/lib/gerente/auth/sessionContext'
import { createInventoryAdjustmentService } from '@/app/admin/estoque/inventoryAdjustment'
import { createInventoryQueryService } from '@/app/admin/estoque/inventoryQueryService'
import { localizeInventoryFailure } from '@/app/admin/estoque/inventoryMessages'
import {
  INVENTORY_ERROR_CODES,
  type InventoryStockListRow,
} from '@shared-core/src/inventory'

type LegacyEstoqueMutationResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string }

async function lojaIdDoUsuarioLogado(): Promise<string | null> {
  return getGerenteLojaId()
}

/**
 * Cria a linha `estoque` zerada de um produto que ainda não tem uma (legado).
 * Mesma regra de `garantirLinhaEstoque`; corrida concorrente (23505) conta como
 * sucesso, porque o objetivo é apenas garantir que a linha exista.
 */
async function criarLinhaEstoqueZerada(
  admin: ReturnType<typeof createAdminClient>,
  produtoId: string,
  lojaId: string,
): Promise<boolean> {
  const { error } = await admin.from('estoque').insert({
    produto_id: produtoId,
    loja_id: lojaId,
    quantidade_atual: 0,
    estoque_minimo: 0,
  })
  return !error || error.code === '23505'
}

export async function atualizarEstoqueProduto(input: unknown): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return actionFail(auth.error, { errorCode: 'UNAUTHORIZED' })

  const parsed = AtualizarEstoqueSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return actionFail(mensagemErroValidacaoZod(msg, idioma), { errorCode: 'VALIDATION_FAILED' })
  }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) {
    return actionFail('Não foi possível identificar sua loja. Faça login novamente.', {
      errorCode: 'UNAUTHORIZED',
    })
  }

  const observacao = parsed.data.observacao?.trim() || null
  const { idioma } = await getUsuarioIdioma()
  return runServerActionWithObservability(
    'gerente/estoque/atualizar',
    async () => {
      let admin: ReturnType<typeof createAdminClient>
      try {
        admin = createAdminClient()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha na configuração do servidor de estoque.'
        throw new Error(mensagemErroComSecao('Estoque', msg))
      }
      // service_role → auth.uid() nulo; RPC exige p_ator_id (mig 269).
      const atorId = auth.session.userId
      if (!atorId) {
        const localized = localizeInventoryFailure(idioma, {
          error: 'AJUSTE_ESTOQUE_AUTH',
          code: INVENTORY_ERROR_CODES.AUTH_REQUIRED,
        })
        throw new Error(mensagemErroComSecao('Estoque', localized.error))
      }
      const adjustment = createInventoryAdjustmentService(admin, lojaId)
      const comando = {
        productId: parsed.data.produto_id,
        lojaId,
        quantity: parsed.data.quantidade_atual,
        estoqueMinimo: parsed.data.estoque_minimo,
        reason: parsed.data.motivo,
        observacao,
        atorId,
      }

      const result = await ajustarComLinhaGarantida(comando, {
        ajustar: (cmd) => adjustment.adjustInventory(cmd),
        garantirLinha: (cmd) => criarLinhaEstoqueZerada(admin, cmd.productId, cmd.lojaId),
      })

      if (!result.ok) {
        const localized = localizeInventoryFailure(idioma, result)
        throw new Error(mensagemErroComSecao('Estoque', localized.error))
      }
      revalidatePath('/gerente/estoque')
      revalidatePath('/admin/estoque')
      return null
    },
    'ajustar_estoque_manual',
  )
}

/**
 * Produtos legados sem linha em `estoque`: cria registro inicial (0 / 0).
 */
export async function garantirLinhaEstoque(input: unknown): Promise<LegacyEstoqueMutationResult> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = ProdutoIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Produto inválido' }
  }

  const supabase = await createClient()
  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja. Faça login novamente.' }

  const { error } = await supabase.from('estoque').insert({
    produto_id: parsed.data.produto_id,
    loja_id: lojaId,
    quantidade_atual: 0,
    estoque_minimo: 0,
  })

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Estoque já existe para este produto.' }
    }
    return { success: false, error: mensagemErroComSecao('Estoque', error.message) }
  }

  revalidatePath('/gerente/estoque')
  return { success: true, data: null }
}

export type EstoqueRowDTO = {
  id: string
  quantidade_atual: number
  estoque_minimo: number
}

export type ProdutoComEstoqueDTO = {
  id: string
  nome: string
  codigo_barras: string | null
  unidade_medida: string
  estoque: EstoqueRowDTO | null
}

export type EstoqueGerenteLinhaDTO = Readonly<{
  id: string
  nome: string
  codigo_barras: string | null
  unidade_medida: string
  origem: string
  categoria_id: string | null
  estoque_id: string | null
  quantidade_atual: number | null
  estoque_minimo: number | null
  deficit: number | null
}>

export type EstoqueGerenteListaResult = Readonly<{
  total: number
  rows: EstoqueGerenteLinhaDTO[]
}>

async function lojaIdResolvidaGestao(): Promise<string> {
  return (await getGerenteLojaId()) ?? LOJA_MATRIZ_ID
}

function mapDomainRowToDto(row: InventoryStockListRow): EstoqueGerenteLinhaDTO {
  return {
    id: row.productId,
    nome: row.nome,
    codigo_barras: row.codigoBarras,
    unidade_medida: row.unidadeMedida,
    origem: row.origem,
    categoria_id: row.categoriaId,
    estoque_id: row.estoqueId,
    quantidade_atual: row.quantity,
    estoque_minimo: row.minimum,
    deficit: row.deficit,
  }
}

/** Lista paginada — canônico: InventoryQueryService → RPC `gerente_estoque_list_page`. */
export async function obterListaEstoqueGerente(input: unknown): Promise<EstoqueGerenteListaResult> {
  // Server Action é endpoint público: sem este guard a listagem de estoque
  // dependia só do RLS e, sem sessão, `lojaIdResolvidaGestao` ainda caía na
  // matriz. As demais actions do módulo já barram aqui.
  const auth = await assertGerenteSession()
  if (!auth.ok) throw new Error(mensagemErroComSecao('Estoque', auth.error))

  const parsed = EstoqueListagemInputSchema.safeParse(input)
  if (!parsed.success) {
    return { total: 0, rows: [] }
  }
  const supabase = await createClient()
  const lojaId = await lojaIdResolvidaGestao()
  const p = parsed.data
  const query = createInventoryQueryService(supabase)
  const result = await query.listStockPage({
    lojaId,
    visao: p.visao,
    busca: p.busca ?? '',
    categoriaId: p.categoria_id ?? null,
    origem: p.origem ?? '',
    ordem: p.ordem,
    dirAsc: p.dir_asc,
    limite: p.limite,
    offset: p.offset,
  })
  if (!result.ok) {
    throw new Error(mensagemErroComSecao('Estoque', result.error))
  }
  return {
    total: result.total,
    rows: result.rows.map(mapDomainRowToDto),
  }
}

const EXPORT_PAGE = 400
const EXPORT_MAX_ROWS = 12_000

/** Todas as linhas que batem nos filtros (paginação servidor em blocos); teto por segurança. */
export async function obterListaEstoqueGerenteCompletaParaExport(input: unknown): Promise<EstoqueGerenteLinhaDTO[]> {
  const auth = await assertGerenteSession()
  if (!auth.ok) throw new Error(mensagemErroComSecao('Estoque', auth.error))

  const parsed = EstoqueListagemInputSchema.omit({ limite: true, offset: true }).safeParse(input)
  if (!parsed.success) return []
  const base = parsed.data
  const acc: EstoqueGerenteLinhaDTO[] = []
  let offset = 0
  while (acc.length < EXPORT_MAX_ROWS) {
    const chunk = await obterListaEstoqueGerente({
      ...base,
      limite: EXPORT_PAGE,
      offset,
    })
    acc.push(...chunk.rows)
    if (chunk.rows.length === 0 || acc.length >= chunk.total || chunk.rows.length < EXPORT_PAGE) break
    offset += EXPORT_PAGE
  }
  return acc
}

export async function atualizarEstoqueProdutoThrow(input: unknown): Promise<void> {
  const r = await atualizarEstoqueProduto(input)
  if (!r.ok) throw new Error(r.error)
}

export async function garantirLinhaEstoqueThrow(input: unknown): Promise<void> {
  const r = await garantirLinhaEstoque(input)
  if (!r.success) throw new Error(r.error)
}

export type EstoqueKpisDTO = Readonly<{
  total_geral: number
  total_critico: number
  total_zerado: number
}>

export async function obterKpisEstoque(): Promise<EstoqueKpisDTO> {
  const auth = await assertGerenteSession()
  if (!auth.ok) throw new Error(mensagemErroComSecao('Estoque', auth.error))

  const supabase = await createClient()
  const lojaId = await lojaIdResolvidaGestao()

  const base = {
    visao: 'geral' as const,
    busca: '',
    categoria_id: null,
    origem: '',
    ordem: 'nome' as const,
    dir_asc: true,
    limite: 1,
    offset: 0,
  }

  const [geralRes, criticoRes, zeradoRes] = await Promise.all([
    obterListaEstoqueGerente(base),
    obterListaEstoqueGerente({ ...base, visao: 'critico' }),
    supabase
      .from('estoque')
      .select('id', { count: 'exact', head: true })
      .eq('loja_id', lojaId)
      .eq('quantidade_atual', 0),
  ])

  return {
    total_geral: geralRes.total,
    total_critico: criticoRes.total,
    total_zerado: zeradoRes.count ?? 0,
  }
}
