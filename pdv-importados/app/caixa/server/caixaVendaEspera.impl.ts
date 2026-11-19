import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroDeExcecao, mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'
import { caixaMsgServidor } from '@/app/caixa/server/caixaMensagensServidor'
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
      /** Vínculo autoritativo; o nome é resolvido à parte (não existe na tabela). */
      clienteId: string | null
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
  clienteId?: string | null
}): Promise<ColocarEmEsperaResult> {
  try {
    const { userId, idioma } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }
    if (!input.itens.length) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_carrinho_vazio') }

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
      p_cliente_id: input.clienteId ?? null,
      p_desconto_gerente_percentual: input.descontoGerentePercentual ?? null,
      p_desconto_gerente_token: null,
    })

    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message, idioma) }
    const row = asRecord(data)
    if (!row?.id) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_colocar_espera') }
    return { ok: true, id: String(row.id), numeroLocal: Number(row.numero_local ?? 0) }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_colocar_espera'), await idiomaOperadorParaErro()),
    }
  }
}

export async function listarVendasEmEsperaImpl(): Promise<ListarEmEsperaResult> {
  try {
    const { userId, idioma } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('listar_vendas_em_espera')
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message, idioma) }
    return {
      ok: true,
      vendas: asRecordArray(data).map(mapCard),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_listar_espera'), await idiomaOperadorParaErro()),
    }
  }
}

/** Traduz códigos de claim da RPC de retomada para mensagem de operador. */
export function mensagemErroRetomarEmEspera(raw: string, idioma?: string): string {
  if (raw.includes('venda_em_espera_em_uso')) {
    return caixaMsgServidor(idioma, 'err_srv_espera_em_uso')
  }
  return mensagemErroParaUsuario(raw, idioma)
}

export async function retomarVendaEmEsperaImpl(id: string): Promise<RetomarEmEsperaResult> {
  try {
    const { userId, idioma } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('retomar_venda_em_espera', { p_id: id })
    if (error) return { ok: false, error: mensagemErroRetomarEmEspera(error.message, idioma) }
    const row = asRecord(data)
    if (!row?.id) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_espera_nao_encontrada') }
    return {
      ok: true,
      id: String(row.id),
      numeroLocal: Number(row.numero_local ?? 0),
      itens: mapItens(row.itens),
      clienteId: row.cliente_id ? String(row.cliente_id) : null,
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_retomar_espera'), await idiomaOperadorParaErro()),
    }
  }
}

/**
 * Consome o pedido em espera DEPOIS que a venda foi realmente finalizada.
 * A retomada só clama (RETOMADA); a baixa terminal é CONVERTIDA aqui.
 */
export async function converterVendaEmEsperaImpl(
  id: string,
): Promise<DescartarEmEsperaResult> {
  try {
    const { userId, idioma } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }
    const supabase = await createClient()
    const { error } = await supabase.rpc('converter_venda_em_espera', { p_id: id })
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message, idioma) }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_converter_espera'), await idiomaOperadorParaErro()),
    }
  }
}

/**
 * Devolve RETOMADA → EM_ESPERA quando o operador desiste do cupom retomado
 * sem vender (preserva o cupom na lista — P2 da certificação operacional).
 */
export async function devolverVendaEmEsperaImpl(
  id: string,
): Promise<DescartarEmEsperaResult> {
  try {
    const { userId, idioma } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }
    const supabase = await createClient()
    const { error } = await supabase.rpc('devolver_venda_em_espera', { p_id: id })
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message, idioma) }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_devolver_espera'), await idiomaOperadorParaErro()),
    }
  }
}

export async function descartarVendaEmEsperaImpl(
  id: string,
  motivo?: string,
): Promise<DescartarEmEsperaResult> {
  try {
    const { userId, idioma } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }
    // RN-03: motivo obrigatório. A validação definitiva é do banco; aqui só evitamos a ida ao servidor.
    if ((motivo ?? '').trim().length < 3) {
      return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_descartar_motivo') }
    }
    const supabase = await createClient()
    const { error } = await supabase.rpc('descartar_venda_em_espera', {
      p_id: id,
      p_motivo: motivo ?? null,
    })
    if (error) {
      if (error.message.includes('motivo_obrigatorio')) {
        return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_descartar_motivo') }
      }
      return { ok: false, error: mensagemErroParaUsuario(error.message, idioma) }
    }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_descartar_espera'), await idiomaOperadorParaErro()),
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
  precoOriginal: number
  tipoPreco: string
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
  descontoGerentePercentual: number
  valorDescontoGerente: number
  itens: HistoricoVendaItemDetalhe[]
  pagamentos: Array<{ formaPagamento: string; valor: number }>
}

export type HistoricoOperadorResult =
  | { ok: true; vendas: HistoricoVendaOperador[] }
  | { ok: false; error: string }

export type HistoricoVendaDetalheResult =
  | { ok: true; detalhe: HistoricoVendaDetalhe }
  /**
   * `code` distingue "a venda não existe" de "não deu para consultar". A
   * recuperação de venda pendente no PDV depende dessa diferença: só o primeiro
   * caso prova que nada foi gravado e libera o reenvio.
   */
  | { ok: false; error: string; code?: 'VENDA_NAO_ENCONTRADA' }

function mapEventoItens(raw: unknown): HistoricoVendaItemDetalhe[] {
  const parsed = parseJsonbRpc(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.map((row) => {
    const r = row as Record<string, unknown>
    const qtd = Number(r.quantidade ?? 0)
    const pu = Number(r.precoUnitario ?? r.preco_unitario ?? 0)
    const po = Number(r.precoOriginal ?? r.preco_original ?? r.precoUnitario ?? r.preco_unitario ?? 0)
    const total = Number(r.total ?? qtd * pu)
    return {
      produtoId: String(r.produtoId ?? r.produto_id ?? ''),
      nome: String(r.nome ?? '—'),
      quantidade: Number.isFinite(qtd) ? qtd : 0,
      precoUnitario: Number.isFinite(pu) ? pu : 0,
      precoOriginal: Number.isFinite(po) ? po : 0,
      tipoPreco: String(r.tipoPreco ?? r.tipo_preco ?? 'VAREJO'),
      total: Number.isFinite(total) ? total : 0,
    }
  })
}

function extrairNomeProduto(row: Record<string, unknown>): string {
  const rel = row.produtos as { nome?: string } | { nome?: string }[] | null | undefined
  const nome = Array.isArray(rel) ? rel[0]?.nome : rel?.nome
  return nome ? String(nome) : '—'
}

/** SSoT: `itens_venda` + `produtos(nome)` para reimpressão fiel. */
export function mapItensVendaHistorico(rows: Record<string, unknown>[]): HistoricoVendaItemDetalhe[] {
  return rows.map((r) => {
    const qtd = Number(r.quantidade ?? 0)
    const pu = Number(r.preco_unitario ?? 0)
    const po = Number(r.preco_unitario_original ?? pu)
    const total = qtd * pu
    return {
      produtoId: String(r.produto_id ?? ''),
      nome: extrairNomeProduto(r),
      quantidade: Number.isFinite(qtd) ? qtd : 0,
      precoUnitario: Number.isFinite(pu) ? pu : 0,
      precoOriginal: Number.isFinite(po) ? po : pu,
      tipoPreco: String(r.tipo_preco ?? 'VAREJO'),
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

/** SSoT: join PostgREST `clientes(nome)` em `vendas.cliente_id`. */
export function extrairClienteNomeDeVenda(row: Record<string, unknown>): string | null {
  const cn = row.clientes as { nome?: string } | { nome?: string }[] | null | undefined
  const nomeCliente = Array.isArray(cn) ? cn[0]?.nome : cn?.nome
  if (nomeCliente == null || nomeCliente === '') return null
  return String(nomeCliente)
}

export async function listarHistoricoOperadorImpl(input?: {
  inicio?: string | null
  fim?: string | null
}): Promise<HistoricoOperadorResult> {
  try {
    const { userId, lojaId, idioma } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }

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
      .select('id, data, total_liquido, forma_pagamento, status, caixa_id, cliente_id, clientes(nome)')
      .eq('operador_id', userId)
      .order('data', { ascending: false })
      .limit(50)

    if (inicio) q = q.gte('data', inicio)
    if (input?.fim) q = q.lte('data', input.fim)

    const { data, error } = await q
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message, idioma) }

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
        clienteNome: extrairClienteNomeDeVenda(r as Record<string, unknown>),
      })),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_carregar_historico'), await idiomaOperadorParaErro()),
    }
  }
}

export async function obterDetalheHistoricoVendaImpl(
  vendaId: string,
): Promise<HistoricoVendaDetalheResult> {
  try {
    const { userId, idioma } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }

    const id = vendaId.trim()
    if (!id) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_venda_invalida') }

    const supabase = await createClient()
    const { data: venda, error: vendaError } = await supabase
      .from('vendas')
      .select(
        'id, data, total_bruto, total_desconto, total_liquido, forma_pagamento, status, cliente_id, clientes(nome)',
      )
      .eq('id', id)
      .eq('operador_id', userId)
      .maybeSingle()

    if (vendaError) return { ok: false, error: mensagemErroParaUsuario(vendaError.message, idioma) }
    if (!venda) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_venda_nao_encontrada'), code: 'VENDA_NAO_ENCONTRADA' }

    const [eventoRes, pagamentosRes, itensRes, descontoRes] = await Promise.all([
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
      supabase
        .from('itens_venda')
        .select(
          'produto_id, quantidade, preco_unitario, preco_unitario_original, tipo_preco, produtos(nome)',
        )
        .eq('venda_id', id)
        .order('id'),
      supabase
        .from('descontos_venda')
        .select('desconto_percentual, desconto_valor')
        .eq('venda_id', id)
        .maybeSingle(),
    ])

    const itensDb = mapItensVendaHistorico(asRecordArray(itensRes.data))
    const itens = itensDb.length > 0 ? itensDb : mapEventoItens(eventoRes.data?.items)
    const valorDescontoGerente = Number(descontoRes.data?.desconto_valor ?? 0)
    const descontoGerentePercentual = Number(descontoRes.data?.desconto_percentual ?? 0)
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
        clienteNome: extrairClienteNomeDeVenda(venda as Record<string, unknown>),
        descontoGerentePercentual: Number.isFinite(descontoGerentePercentual)
          ? descontoGerentePercentual
          : 0,
        valorDescontoGerente: Number.isFinite(valorDescontoGerente) ? valorDescontoGerente : 0,
        itens,
        pagamentos,
      },
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_carregar_detalhe'), await idiomaOperadorParaErro()),
    }
  }
}
