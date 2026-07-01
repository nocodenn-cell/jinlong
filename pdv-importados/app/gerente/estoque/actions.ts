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
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getGerenteLojaId } from '@/lib/gerente/auth/sessionContext'

type LegacyEstoqueMutationResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string }

async function lojaIdDoUsuarioLogado(): Promise<string | null> {
  return getGerenteLojaId()
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
  return runServerActionWithObservability(
    'gerente/estoque/atualizar',
    async () => {
      const admin = createAdminClient()
      const { error } = await admin.rpc('ajustar_estoque_manual', {
        p_produto_id: parsed.data.produto_id,
        p_loja_id: lojaId,
        p_quantidade_atual: parsed.data.quantidade_atual,
        p_estoque_minimo: parsed.data.estoque_minimo,
        p_motivo_codigo: parsed.data.motivo,
        p_observacao: observacao ?? undefined,
      })
      if (error) {
        throw new Error(mensagemErroComSecao('Estoque', error.message))
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

  // Writer único de criação de linha (Fase 2): RPC idempotente por (loja_id, produto_id).
  const { error } = await supabase.rpc('garantir_linha_estoque', {
    p_produto_id: parsed.data.produto_id,
    p_loja_id: lojaId,
  })

  if (error) {
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

function mapRpcRow(raw: Record<string, unknown>): EstoqueGerenteLinhaDTO {
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : String(v))
  return {
    id: String(raw.id),
    nome: String(raw.nome ?? ''),
    codigo_barras: str(raw.codigo_barras),
    unidade_medida: String(raw.unidade_medida ?? 'UN'),
    origem: String(raw.origem ?? ''),
    categoria_id: str(raw.categoria_id),
    estoque_id: str(raw.estoque_id),
    quantidade_atual: num(raw.quantidade_atual),
    estoque_minimo: num(raw.estoque_minimo),
    deficit: num(raw.deficit),
  }
}

function parseListaPayload(raw: unknown): EstoqueGerenteListaResult {
  if (!raw || typeof raw !== 'object') {
    return { total: 0, rows: [] }
  }
  const o = raw as Record<string, unknown>
  const total = typeof o.total === 'number' ? o.total : Number(o.total) || 0
  const rowsRaw = o.rows
  if (!Array.isArray(rowsRaw)) return { total, rows: [] }
  return {
    total,
    rows: rowsRaw.map((r) => mapRpcRow(r as Record<string, unknown>)),
  }
}

/** Lista paginada (RPC `gerente_estoque_list_page`). */
export async function obterListaEstoqueGerente(input: unknown): Promise<EstoqueGerenteListaResult> {
  const parsed = EstoqueListagemInputSchema.safeParse(input)
  if (!parsed.success) {
    return { total: 0, rows: [] }
  }
  const supabase = await createClient()
  const lojaId = await lojaIdResolvidaGestao()
  const p = parsed.data
  const { data, error } = await supabase.rpc('gerente_estoque_list_page', {
    p_loja_id: lojaId,
    p_visao: p.visao,
    p_busca: p.busca ?? '',
    p_categoria_id: p.categoria_id ?? null,
    p_origem: p.origem ?? '',
    p_ordem: p.ordem,
    p_dir_asc: p.dir_asc,
    p_limite: p.limite,
    p_offset: p.offset,
  })
  if (error) {
    throw new Error(mensagemErroComSecao('Estoque', error.message))
  }
  return parseListaPayload(data)
}

const EXPORT_PAGE = 400
const EXPORT_MAX_ROWS = 12_000

/** Todas as linhas que batem nos filtros (paginação servidor em blocos); teto por segurança. */
export async function obterListaEstoqueGerenteCompletaParaExport(input: unknown): Promise<EstoqueGerenteLinhaDTO[]> {
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
