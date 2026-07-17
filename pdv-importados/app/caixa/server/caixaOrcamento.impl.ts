import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { mensagemErroDeExcecao, mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import type { ItemCarrinho } from '@/stores/unifiedCartStore'

/**
 * Fase 5, Entrega 6 — Orçamento (venda não vinculante). Não passa pela RPC de
 * finalização; conversão em venda real reusa o fluxo normal de finalização
 * (v4), só prefillando o carrinho a partir do orçamento — ver
 * marcarOrcamentoConvertidoImpl, chamada pelo caixa após o finalize ter
 * sucesso (mesmo padrão de caixaVendaEspera.impl.ts).
 */

export type OrcamentoCard = {
  id: string
  numeroLocal: number
  totalLiquido: number
  qtdItens: number
  clienteId: string | null
  nomeCliente: string | null
  validadeAte: string
  criadoEm: string
  atualizadoEm: string
}

export type CriarOrcamentoResult =
  | { ok: true; id: string; numeroLocal: number; validadeAte: string }
  | { ok: false; error: string }

export type ListarOrcamentosResult =
  | { ok: true; orcamentos: OrcamentoCard[] }
  | { ok: false; error: string }

export type ObterOrcamentoResult =
  | { ok: true; id: string; numeroLocal: number; itens: ItemCarrinho[]; clienteId: string | null; status: string }
  | { ok: false; error: string }

export type CancelarOrcamentoResult = { ok: true } | { ok: false; error: string }

function parseJsonbRpc(data: unknown): unknown {
  if (data == null) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown
    } catch {
      return null
    }
  }
  return data
}

function asRecordArray(data: unknown): Record<string, unknown>[] {
  const parsed = parseJsonbRpc(data)
  return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
}

function asRecord(data: unknown): Record<string, unknown> | null {
  const parsed = parseJsonbRpc(data)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  return null
}

function mapCard(row: Record<string, unknown>): OrcamentoCard {
  const totaisRaw = row.totais
  const totais =
    typeof totaisRaw === 'string'
      ? (parseJsonbRpc(totaisRaw) as Record<string, unknown> | null) ?? {}
      : ((totaisRaw ?? {}) as Record<string, unknown>)
  const totalLiquido = Number(totais.totalLiquido ?? totais.total_liquido ?? 0)
  return {
    id: String(row.id),
    numeroLocal: Number(row.numero_local ?? 0),
    totalLiquido: Number.isFinite(totalLiquido) ? totalLiquido : 0,
    qtdItens: Number(row.qtd_itens ?? 0),
    clienteId: row.cliente_id ? String(row.cliente_id) : null,
    nomeCliente: row.nome_cliente ? String(row.nome_cliente) : null,
    validadeAte: String(row.validade_ate ?? ''),
    criadoEm: String(row.criado_em ?? ''),
    atualizadoEm: String(row.atualizado_em ?? ''),
  }
}

function mapItens(raw: unknown): ItemCarrinho[] {
  const parsed = parseJsonbRpc(raw)
  return Array.isArray(parsed) ? (parsed as ItemCarrinho[]) : []
}

export async function criarOrcamentoImpl(input: {
  itens: ItemCarrinho[]
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  clienteId?: string | null
  validadeDias?: number
}): Promise<CriarOrcamentoResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    if (!input.itens.length) return { ok: false, error: 'Carrinho vazio.' }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('criar_orcamento', {
      p_itens: input.itens,
      p_totais: {
        totalBruto: input.totalBruto,
        totalDesconto: input.totalDesconto,
        totalLiquido: input.totalLiquido,
      },
      p_cliente_id: input.clienteId ?? null,
      p_validade_dias: input.validadeDias ?? 7,
    })

    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
    const row = asRecord(data)
    if (!row?.id) return { ok: false, error: 'Não foi possível criar o orçamento.' }
    return {
      ok: true,
      id: String(row.id),
      numeroLocal: Number(row.numero_local ?? 0),
      validadeAte: String(row.validade_ate ?? ''),
    }
  } catch (e) {
    return { ok: false, error: mensagemErroDeExcecao(e, 'Não foi possível criar o orçamento.') }
  }
}

export async function listarOrcamentosImpl(): Promise<ListarOrcamentosResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('listar_orcamentos')
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
    return { ok: true, orcamentos: asRecordArray(data).map(mapCard) }
  } catch (e) {
    return { ok: false, error: mensagemErroDeExcecao(e, 'Não foi possível listar orçamentos.') }
  }
}

export async function obterOrcamentoImpl(id: string): Promise<ObterOrcamentoResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('obter_orcamento', { p_id: id })
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
    const row = asRecord(data)
    if (!row?.id) return { ok: false, error: 'Orçamento não encontrado.' }
    return {
      ok: true,
      id: String(row.id),
      numeroLocal: Number(row.numero_local ?? 0),
      itens: mapItens(row.itens),
      clienteId: row.cliente_id ? String(row.cliente_id) : null,
      status: String(row.status ?? ''),
    }
  } catch (e) {
    return { ok: false, error: mensagemErroDeExcecao(e, 'Não foi possível carregar o orçamento.') }
  }
}

export async function cancelarOrcamentoImpl(
  id: string,
  motivo?: string,
): Promise<CancelarOrcamentoResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    const supabase = await createClient()
    const { error } = await supabase.rpc('cancelar_orcamento', {
      p_id: id,
      p_motivo: motivo ?? null,
    })
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemErroDeExcecao(e, 'Não foi possível cancelar o orçamento.') }
  }
}

/** Best-effort: marca o orçamento de origem como CONVERTIDO pós-finalização. */
export async function marcarOrcamentoConvertidoImpl(id: string, vendaId: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.rpc('marcar_orcamento_convertido', { p_id: id, p_venda_id: vendaId })
  } catch {
    // best-effort: a venda já foi finalizada; falha aqui não deve propagar.
  }
}
