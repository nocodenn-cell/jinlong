import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroDeExcecao, mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import type { ItemCarrinho } from '@/stores/unifiedCartStore'

export type VendaEmEsperaCard = {
  id: string
  numeroLocal: number
  totalLiquido: number
  qtdItens: number
  criadaEm: string
  atualizadaEm: string
}

export type ColocarEmEsperaResult =
  | { ok: true; id: string; numeroLocal: number }
  | { ok: false; error: string }

export type ListarEmEsperaResult =
  | { ok: true; vendas: VendaEmEsperaCard[] }
  | { ok: false; error: string }

export type RetomarEmEsperaResult =
  | {
      ok: true
      id: string
      numeroLocal: number
      itens: ItemCarrinho[]
    }
  | { ok: false; error: string }

export type DescartarEmEsperaResult =
  | { ok: true }
  | { ok: false; error: string }

/** PostgREST pode devolver jsonb como array, objeto ou string JSON. */
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
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[]
  return []
}

function asRecord(data: unknown): Record<string, unknown> | null {
  const parsed = parseJsonbRpc(data)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  return null
}

function mapCard(row: Record<string, unknown>): VendaEmEsperaCard {
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
    criadaEm: String(row.criada_em ?? ''),
    atualizadaEm: String(row.atualizada_em ?? ''),
  }
}

function mapItens(raw: unknown): ItemCarrinho[] {
  const parsed = parseJsonbRpc(raw)
  if (!Array.isArray(parsed)) return []
  return parsed as ItemCarrinho[]
}

export async function colocarVendaEmEsperaImpl(input: {
  itens: ItemCarrinho[]
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  caixaId?: string | null
  descontoGerentePercentual?: number | null
}): Promise<ColocarEmEsperaResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    if (!input.itens.length) return { ok: false, error: 'Carrinho vazio.' }

    const supabase = await createClient()
    // Não persiste token de gerente: ao retomar, desconto exige nova autorização
    // (evita finalize falhar com token expirado — requisito do fluxo de espera).
    const { data, error } = await supabase.rpc('colocar_venda_em_espera', {
      p_itens: input.itens,
      p_totais: {
        totalBruto: input.totalBruto,
        totalDesconto: input.totalDesconto,
        totalLiquido: input.totalLiquido,
      },
      p_caixa_id: input.caixaId ?? null,
      p_cliente_id: null,
      p_desconto_gerente_percentual: input.descontoGerentePercentual ?? null,
      p_desconto_gerente_token: null,
    })

    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
    const row = asRecord(data)
    if (!row?.id) return { ok: false, error: 'Não foi possível colocar a venda em espera.' }
    return { ok: true, id: String(row.id), numeroLocal: Number(row.numero_local ?? 0) }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível colocar a venda em espera.'),
    }
  }
}

export async function listarVendasEmEsperaImpl(): Promise<ListarEmEsperaResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('listar_vendas_em_espera')
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
    return {
      ok: true,
      vendas: asRecordArray(data).map(mapCard),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível listar vendas em espera.'),
    }
  }
}

export async function retomarVendaEmEsperaImpl(id: string): Promise<RetomarEmEsperaResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('retomar_venda_em_espera', { p_id: id })
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
    const row = asRecord(data)
    if (!row?.id) return { ok: false, error: 'Venda em espera não encontrada.' }
    return {
      ok: true,
      id: String(row.id),
      numeroLocal: Number(row.numero_local ?? 0),
      itens: mapItens(row.itens),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível retomar a venda em espera.'),
    }
  }
}

export async function descartarVendaEmEsperaImpl(
  id: string,
  motivo?: string,
): Promise<DescartarEmEsperaResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    const supabase = await createClient()
    const { error } = await supabase.rpc('descartar_venda_em_espera', {
      p_id: id,
      p_motivo: motivo ?? null,
    })
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível descartar a venda em espera.'),
    }
  }
}

/** Número curto exibido ao operador (sem coluna numero_venda no schema). */
export function formatNumeroVendaHistorico(vendaId: string): string {
  const short = vendaId.replace(/-/g, '').slice(0, 8).toUpperCase()
  return short ? `#${short}` : '—'
}

/** Histórico do operador no PDV — vendas do próprio usuário (dia/turno). */
export type HistoricoVendaOperador = {
  id: string
  numeroVenda: string
  data: string | null
  totalLiquido: number
  formaPagamento: string | null
  status: string | null
  qtdItens: number
  clienteNome: string | null
}

export type HistoricoVendaItemDetalhe = {
  produtoId: string
  nome: string
  quantidade: number
  precoUnitario: number
  total: number
}

export type HistoricoVendaDetalhe = {
  id: string
  numeroVenda: string
  data: string | null
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  formaPagamento: string | null
  status: string | null
  clienteNome: string | null
  itens: HistoricoVendaItemDetalhe[]
  pagamentos: Array<{ formaPagamento: string; valor: number }>
}

export type HistoricoOperadorResult =
  | { ok: true; vendas: HistoricoVendaOperador[] }
  | { ok: false; error: string }

export type HistoricoVendaDetalheResult =
  | { ok: true; detalhe: HistoricoVendaDetalhe }
  | { ok: false; error: string }

function mapEventoItens(raw: unknown): HistoricoVendaItemDetalhe[] {
  const parsed = parseJsonbRpc(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.map((row) => {
    const r = row as Record<string, unknown>
    const qtd = Number(r.quantidade ?? 0)
    const pu = Number(r.precoUnitario ?? r.preco_unitario ?? 0)
    const total = Number(r.total ?? qtd * pu)
    return {
      produtoId: String(r.produtoId ?? r.produto_id ?? ''),
      nome: String(r.nome ?? '—'),
      quantidade: Number.isFinite(qtd) ? qtd : 0,
      precoUnitario: Number.isFinite(pu) ? pu : 0,
      total: Number.isFinite(total) ? total : 0,
    }
  })
}

function contagemItensLedger(rows: Record<string, unknown>[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const saleId = String(row.sale_id ?? '')
    if (!saleId) continue
    const itens = mapEventoItens(row.items)
    map.set(saleId, itens.length)
  }
  return map
}

export async function listarHistoricoOperadorImpl(input?: {
  inicio?: string | null
  fim?: string | null
}): Promise<HistoricoOperadorResult> {
  try {
    const { userId, lojaId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const supabase = await createClient()
    const inicio =
      input?.inicio ??
      (() => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        return d.toISOString()
      })()

    let q = supabase
      .from('vendas')
      .select('id, data, total_liquido, forma_pagamento, status, caixa_id')
      .eq('operador_id', userId)
      .order('data', { ascending: false })
      .limit(50)

    if (inicio) q = q.gte('data', inicio)
    if (input?.fim) q = q.lte('data', input.fim)

    const { data, error } = await q
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }

    const rows = data ?? []
    const ids = rows.map((r) => r.id as string)
    const contagem = new Map<string, number>()
    if (ids.length > 0) {
      const { data: eventos } = await supabase
        .from('venda_eventos')
        .select('sale_id, items')
        .in('sale_id', ids)
        .eq('event_type', 'SALE_REGISTERED')
      for (const [saleId, qtd] of contagemItensLedger(asRecordArray(eventos))) {
        contagem.set(saleId, qtd)
      }
    }

    // TODO(auditoria-255): filtrar explicitamente por lojaId quando necessário
    // TODO(fase-7): vendas.cliente_id → join clientes para clienteNome na lista
    void lojaId
    void LOJA_MATRIZ_ID

    return {
      ok: true,
      vendas: rows.map((r) => ({
        id: String(r.id),
        numeroVenda: formatNumeroVendaHistorico(String(r.id)),
        data: r.data ? String(r.data) : null,
        totalLiquido: Number(r.total_liquido ?? 0),
        formaPagamento: r.forma_pagamento ? String(r.forma_pagamento) : null,
        status: r.status ? String(r.status) : null,
        qtdItens: contagem.get(String(r.id)) ?? 0,
        clienteNome: null,
      })),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível carregar o histórico.'),
    }
  }
}

export async function obterDetalheHistoricoVendaImpl(
  vendaId: string,
): Promise<HistoricoVendaDetalheResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const id = vendaId.trim()
    if (!id) return { ok: false, error: 'Venda inválida.' }

    const supabase = await createClient()
    const { data: venda, error: vendaError } = await supabase
      .from('vendas')
      .select(
        'id, data, total_bruto, total_desconto, total_liquido, forma_pagamento, status',
      )
      .eq('id', id)
      .eq('operador_id', userId)
      .maybeSingle()

    if (vendaError) return { ok: false, error: mensagemErroParaUsuario(vendaError.message) }
    if (!venda) return { ok: false, error: 'Venda não encontrada.' }

    const [eventoRes, pagamentosRes] = await Promise.all([
      supabase
        .from('venda_eventos')
        .select('items, total, total_bruto, forma_pagamento, occurred_at')
        .eq('sale_id', id)
        .eq('event_type', 'SALE_REGISTERED')
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('vendas_pagamentos')
        .select('forma_pagamento, valor')
        .eq('venda_id', id),
    ])

    const itens = mapEventoItens(eventoRes.data?.items)
    const pagamentosRaw = pagamentosRes.data ?? []
    const pagamentos =
      pagamentosRaw.length > 0
        ? pagamentosRaw.map((p) => ({
            formaPagamento: String(p.forma_pagamento ?? ''),
            valor: Number(p.valor ?? 0),
          }))
        : [
            {
              formaPagamento: String(venda.forma_pagamento ?? ''),
              valor: Number(venda.total_liquido ?? 0),
            },
          ]

    return {
      ok: true,
      detalhe: {
        id: String(venda.id),
        numeroVenda: formatNumeroVendaHistorico(String(venda.id)),
        data: venda.data ? String(venda.data) : null,
        totalBruto: Number(venda.total_bruto ?? 0),
        totalDesconto: Number(venda.total_desconto ?? 0),
        totalLiquido: Number(venda.total_liquido ?? 0),
        formaPagamento: venda.forma_pagamento ? String(venda.forma_pagamento) : null,
        status: venda.status ? String(venda.status) : null,
        clienteNome: null,
        itens,
        pagamentos,
      },
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível carregar o detalhe da venda.'),
    }
  }
}
