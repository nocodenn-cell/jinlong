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
import { AtualizarEstoqueSchema, EstoqueListagemInputSchema } from './actions.validation'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getGerenteLojaId } from '@/lib/gerente/auth/sessionContext'

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
      let admin: ReturnType<typeof createAdminClient>
      try {
        admin = createAdminClient()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha na configuração do servidor de estoque.'
        throw new Error(mensagemErroComSecao('Estoque', msg))
      }
      const { error } = await admin.rpc('ajustar_estoque_manual', {
        p_produto_id: parsed.data.produto_id,
        p_loja_id: lojaId,
        p_quantidade_atual: parsed.data.quantidade_atual,
        p_estoque_minimo: parsed.data.estoque_minimo,
        p_motivo_codigo: parsed.data.motivo,
        p_observacao: observacao ?? undefined,
        // service_role → auth.uid() nulo; ator = sessão já validada em assertGerenteSession
        p_ator_id: auth.session.userId,
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
