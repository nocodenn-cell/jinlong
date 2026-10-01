'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { getGerenteLojaId, getGerenteUserId } from '@/lib/gerente/auth/sessionContext'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { lojaIdDaSessao } from '@/app/gerente/fornecedores/fornecedorContrato'
import { mensagemSeFornecedorForaDaLoja } from './fornecedorOcBoundary'
import { montarFiltroBuscaOc } from './ocBusca'
import {
  mensagemErroOc,
  mensagemPosEntradaOc,
  saldoPendente,
  totaisRecebimento,
  valorPendente,
  type OcEntradaResultado,
  type OcResumoRecebimento,
} from './ocRecebimento'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

export type StatusOC = 'RASCUNHO' | 'CONFIRMADA' | 'EM_TRANSITO' | 'RECEBIDA' | 'CANCELADA'

const STATUS_TRANSITIONS: Record<StatusOC, StatusOC[]> = {
  RASCUNHO: ['CONFIRMADA', 'CANCELADA'],
  CONFIRMADA: ['EM_TRANSITO', 'CANCELADA'],
  // UX-04: RECEBIDA nunca é escolhida à mão — só o banco a atribui, quando o saldo zera
  // (`receber_ordem_compra`) ou por `encerrar_ordem_compra_com_falta`.
  EM_TRANSITO: ['CANCELADA'],
  RECEBIDA: [],
  CANCELADA: [],
}

export type OcItemDTO = {
  id: string
  produto_id: string | null
  produto_nome: string | null
  descricao: string | null
  quantidade: number
  preco_unitario: number
  quantidade_recebida: number
  /** UX-04: o que ainda falta chegar desta linha (derivado: pedido − recebido, nunca negativo). */
  saldo_pendente: number
  unidade_medida: string
}

export type OcListaDTO = {
  id: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  status: StatusOC
  data_emissao: string
  data_prevista_chegada: string | null
  observacao: string | null
  total_itens: number
  valor_total: number
  created_at: string
  /** UX-04: totais derivados de pedido/recebido por item — não existe status "parcial" no banco. */
  pedido_total: number
  recebido_total: number
  pendente_total: number
  encerrada_com_falta: boolean
  encerramento_motivo: string | null
}

/** Uma entrada de mercadoria ligada ao pedido (reconstruída do razão por item). */
export type OcEntradaHistoricoDTO = {
  entrada_id: string
  origem: 'ORDEM_COMPRA' | 'REMESSA' | 'NFE'
  created_at: string
  /** Recebimento anterior à UX-04, reconstruído da quantidade acumulada (sem data/autor por entrada). */
  legado: boolean
  total: number
  itens: Array<{ item_id: string; nome: string; quantidade: number }>
}

export type OcDetalheDTO = OcListaDTO & {
  itens: OcItemDTO[]
  entradas: OcEntradaHistoricoDTO[]
}

export type OcKpisDTO = {
  total_rascunho: number
  total_confirmadas: number
  total_em_transito: number
  valor_em_transito: number
}

export type OcListaResult = {
  rows: OcListaDTO[]
  total: number
  /** Preenchido quando a consulta FALHOU — distingue "erro" de "nenhuma ordem" (os KPIs contam as mesmas linhas). */
  erro?: string
}

export type OcItemInput = {
  produto_id?: string | null
  descricao?: string | null
  quantidade: number
  preco_unitario: number
  unidade_medida: string
}

export type CriarOcInput = {
  fornecedor_id?: string | null
  fornecedor_nome?: string | null
  data_emissao?: string
  data_prevista_chegada?: string | null
  observacao?: string | null
  itens: OcItemInput[]
}

export type AtualizarOcInput = CriarOcInput & { id: string }

async function lojaDoUsuario(): Promise<string | null> {
  return getGerenteLojaId()
}

/** Confirma que fornecedor_id (se informado) existe e pertence à loja da OC. */
async function assertFornecedorDaLojaOc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lojaId: string,
  fornecedorId: string | null | undefined,
): Promise<string | null> {
  if (!fornecedorId) return null
  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, loja_id')
    .eq('id', fornecedorId)
    .maybeSingle()
  if (error) return mensagemErroComSecao('Fornecedor', error.message)
  return mensagemSeFornecedorForaDaLoja({
    fornecedorId,
    fornecedorLojaId: (data?.loja_id as string | undefined) ?? null,
    lojaIdOc: lojaId,
  })
}

type RawOcItem = { quantidade: number; preco_unitario: number; quantidade_recebida: number }
type RawOcRow = {
  id: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  status: string
  data_emissao: string
  data_prevista_chegada: string | null
  observacao: string | null
  created_at: string
  encerrada_com_falta_em: string | null
  encerramento_motivo: string | null
  fornecedor: { nome: string } | null
  itens: RawOcItem[]
}

function mapOcListaRow(row: RawOcRow): OcListaDTO {
  const itens = row.itens ?? []
  return {
    id: row.id,
    fornecedor_id: row.fornecedor_id,
    fornecedor_nome: row.fornecedor?.nome ?? row.fornecedor_nome ?? null,
    status: row.status as StatusOC,
    data_emissao: row.data_emissao,
    data_prevista_chegada: row.data_prevista_chegada,
    observacao: row.observacao,
    total_itens: itens.length,
    valor_total: itens.reduce((sum, i) => sum + i.quantidade * i.preco_unitario, 0),
    created_at: row.created_at,
    ...totaisRecebimento(itens),
    encerrada_com_falta: row.encerrada_com_falta_em != null,
    encerramento_motivo: row.encerramento_motivo ?? null,
  }
}

const OC_SELECT = `
  id, fornecedor_id, fornecedor_nome, status,
  data_emissao, data_prevista_chegada, observacao, created_at,
  encerrada_com_falta_em, encerramento_motivo,
  fornecedor:fornecedores!fornecedor_id(nome),
  itens:ordens_compra_itens(quantidade, preco_unitario, quantidade_recebida)
`

const OC_DETALHE_SELECT = `
  id, fornecedor_id, fornecedor_nome, status,
  data_emissao, data_prevista_chegada, observacao, created_at,
  encerrada_com_falta_em, encerramento_motivo,
  fornecedor:fornecedores!fornecedor_id(nome),
  itens:ordens_compra_itens(
    id, produto_id, descricao, quantidade, preco_unitario,
    quantidade_recebida, unidade_medida,
    produto:produtos!produto_id(nome)
  )
`

export async function obterKpisCompras(): Promise<OcKpisDTO> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { total_rascunho: 0, total_confirmadas: 0, total_em_transito: 0, valor_em_transito: 0 }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { total_rascunho: 0, total_confirmadas: 0, total_em_transito: 0, valor_em_transito: 0 }

  const supabase = await createClient()

  const [{ data: statusRows }, { data: transitoOrdens }] = await Promise.all([
    supabase
      .from('ordens_compra')
      .select('status')
      .eq('loja_id', lojaId)
      .in('status', ['RASCUNHO', 'CONFIRMADA', 'EM_TRANSITO']),
    supabase
      .from('ordens_compra')
      .select('itens:ordens_compra_itens(quantidade, preco_unitario, quantidade_recebida)')
      .eq('loja_id', lojaId)
      .eq('status', 'EM_TRANSITO'),
  ])

  const rows = statusRows ?? []
  const total_rascunho = rows.filter((r) => r.status === 'RASCUNHO').length
  const total_confirmadas = rows.filter((r) => r.status === 'CONFIRMADA').length
  const total_em_transito = rows.filter((r) => r.status === 'EM_TRANSITO').length

  // UX-04: "em trânsito" é só o que AINDA falta chegar (saldo × preço). Antes somava o pedido
  // cheio, mesmo depois de a mercadoria entrar por nota/entrada — inflava o indicador.
  const valor_em_transito = (transitoOrdens ?? []).reduce((sum, oc) => {
    const ocItens = (oc.itens as RawOcItem[]) ?? []
    return sum + valorPendente(ocItens)
  }, 0)

  return { total_rascunho, total_confirmadas, total_em_transito, valor_em_transito }
}

export async function listarOrdensCompra(input: {
  status?: StatusOC | null
  busca?: string
  limite: number
  offset: number
}): Promise<OcListaResult> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { rows: [], total: 0 }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { rows: [], total: 0 }

  const supabase = await createClient()

  let q = supabase
    .from('ordens_compra')
    .select(OC_SELECT, { count: 'exact' })
    .eq('loja_id', lojaId)
    .order('created_at', { ascending: false })
    .range(input.offset, input.offset + input.limite - 1)

  if (input.status) q = q.eq('status', input.status)

  const filtroBusca = montarFiltroBuscaOc(input.busca)
  if (filtroBusca) q = q.or(filtroBusca)

  const { data, error, count } = await q

  if (error) return { rows: [], total: 0, erro: error.message }

  return {
    rows: (data as unknown as RawOcRow[]).map(mapOcListaRow),
    total: count ?? 0,
  }
}

/**
 * S8/RM-14 — OCs elegíveis para o vínculo opcional do recebimento manual.
 * Elegível = CONFIRMADA ou EM_TRANSITO (RASCUNHO ainda não foi confirmada
 * pelo fornecedor; CANCELADA/RECEBIDA não fazem sentido como vínculo novo —
 * RECEBIDA em particular é recusada de novo, defensivamente, no momento do
 * submit por `validarVinculoOrdemCompra`). Reaproveita `listarOrdensCompra`
 * duas vezes (uma por status) em vez de uma query nova — mesma RLS, mesmo
 * escopo de loja, mesma busca, já testados; nenhum modelo de dado novo.
 */
export async function listarOrdensCompraElegiveisParaVinculo(busca?: string): Promise<OcListaDTO[]> {
  const [confirmadas, emTransito] = await Promise.all([
    listarOrdensCompra({ status: 'CONFIRMADA', busca, limite: 10, offset: 0 }),
    listarOrdensCompra({ status: 'EM_TRANSITO', busca, limite: 10, offset: 0 }),
  ])
  return [...confirmadas.rows, ...emTransito.rows]
}

export async function obterOrdemCompraDetalhe(id: string): Promise<R<OcDetalheDTO>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Loja não identificada.' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ordens_compra')
    .select(OC_DETALHE_SELECT)
    .eq('id', id)
    .eq('loja_id', lojaId)
    .single()

  if (error || !data) return { success: false, error: 'Ordem não encontrada.' }

  type RawDetalheItem = {
    id: string
    produto_id: string | null
    descricao: string | null
    quantidade: number
    preco_unitario: number
    quantidade_recebida: number
    unidade_medida: string
    produto: { nome: string } | null
  }

  const raw = data as unknown as {
    id: string
    fornecedor_id: string | null
    fornecedor_nome: string | null
    status: string
    data_emissao: string
    data_prevista_chegada: string | null
    observacao: string | null
    created_at: string
    encerrada_com_falta_em: string | null
    encerramento_motivo: string | null
    fornecedor: { nome: string } | null
    itens: RawDetalheItem[]
  }

  const itens: OcItemDTO[] = (raw.itens ?? []).map((i) => ({
    id: i.id,
    produto_id: i.produto_id,
    produto_nome: i.produto?.nome ?? null,
    descricao: i.descricao,
    quantidade: i.quantidade,
    preco_unitario: i.preco_unitario,
    quantidade_recebida: i.quantidade_recebida,
    saldo_pendente: saldoPendente(i.quantidade, i.quantidade_recebida),
    unidade_medida: i.unidade_medida,
  }))

  // Histórico de entradas (razão por item, append-only): reconstrói "quem entregou o quê e quando"
  // — pelo Receber do pedido, por NF-e ou por entrada sem nota vinculada.
  const { data: razao } = await supabase
    .from('ordens_compra_recebimentos')
    .select('entrada_id, ordem_item_id, origem, quantidade, legado, created_at')
    .eq('ordem_id', id)
    .eq('loja_id', lojaId)
    .order('created_at', { ascending: true })

  const nomePorItem = new Map(itens.map((i) => [i.id, i.produto_nome ?? i.descricao ?? '—']))
  const entradasPorId = new Map<string, OcEntradaHistoricoDTO>()
  for (const r of razao ?? []) {
    const atual: OcEntradaHistoricoDTO = entradasPorId.get(r.entrada_id) ?? {
      entrada_id: r.entrada_id,
      origem: r.origem as OcEntradaHistoricoDTO['origem'],
      created_at: r.created_at,
      legado: r.legado,
      total: 0,
      itens: [],
    }
    atual.total += Number(r.quantidade)
    atual.itens.push({
      item_id: r.ordem_item_id,
      nome: nomePorItem.get(r.ordem_item_id) ?? '—',
      quantidade: Number(r.quantidade),
    })
    entradasPorId.set(r.entrada_id, atual)
  }

  const dto: OcDetalheDTO = {
    id: raw.id,
    fornecedor_id: raw.fornecedor_id,
    fornecedor_nome: raw.fornecedor?.nome ?? raw.fornecedor_nome ?? null,
    status: raw.status as StatusOC,
    data_emissao: raw.data_emissao,
    data_prevista_chegada: raw.data_prevista_chegada,
    observacao: raw.observacao,
    total_itens: itens.length,
    valor_total: itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0),
    created_at: raw.created_at,
    ...totaisRecebimento(itens),
    encerrada_com_falta: raw.encerrada_com_falta_em != null,
    encerramento_motivo: raw.encerramento_motivo ?? null,
    itens,
    entradas: [...entradasPorId.values()],
  }

  return { success: true, data: dto }
}

export async function criarOrdemCompra(input: CriarOcInput): Promise<R<string>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!input.itens.length) return { success: false, error: 'Adicione ao menos um item.' }

  const tenant = lojaIdDaSessao(auth.session)
  if (!tenant.ok) return { success: false, error: tenant.error }
  const lojaId = tenant.lojaId

  const userId = await getGerenteUserId()
  if (!userId) return { success: false, error: 'Faça login novamente.' }

  const supabase = await createClient()
  const fornErr = await assertFornecedorDaLojaOc(supabase, lojaId, input.fornecedor_id)
  if (fornErr) return { success: false, error: fornErr }

  const { data: oc, error: e1 } = await supabase
    .from('ordens_compra')
    .insert({
      loja_id: lojaId,
      fornecedor_id: input.fornecedor_id ?? null,
      fornecedor_nome: input.fornecedor_nome?.trim() || null,
      data_emissao: input.data_emissao ?? new Date().toISOString().slice(0, 10),
      data_prevista_chegada: input.data_prevista_chegada ?? null,
      observacao: input.observacao?.trim() || null,
      status: 'RASCUNHO',
      created_by: userId ?? '',
    })
    .select('id')
    .single()

  if (e1 || !oc) {
    return { success: false, error: mensagemErroComSecao('Ordem de compra', e1?.message ?? '') }
  }

  const itensRows = input.itens.map((i) => ({
    ordem_id: oc.id,
    produto_id: i.produto_id ?? null,
    descricao: i.descricao?.trim() || null,
    quantidade: i.quantidade,
    preco_unitario: i.preco_unitario,
    unidade_medida: i.unidade_medida,
  }))

  const { error: e2 } = await supabase.from('ordens_compra_itens').insert(itensRows)
  if (e2) return { success: false, error: mensagemErroComSecao('Itens da ordem', e2.message) }

  revalidatePath('/gerente/compras')
  return { success: true, data: oc.id }
}

export async function atualizarOrdemCompra(input: AtualizarOcInput): Promise<R<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!input.itens.length) return { success: false, error: 'Adicione ao menos um item.' }

  const tenant = lojaIdDaSessao(auth.session)
  if (!tenant.ok) return { success: false, error: tenant.error }
  const lojaId = tenant.lojaId

  const supabase = await createClient()

  const { data: existing, error: eCheck } = await supabase
    .from('ordens_compra')
    .select('status')
    .eq('id', input.id)
    .eq('loja_id', lojaId)
    .single()

  if (eCheck || !existing) return { success: false, error: 'Ordem não encontrada.' }
  if (!['RASCUNHO', 'CONFIRMADA'].includes(existing.status)) {
    return { success: false, error: 'Só é possível editar ordens em rascunho ou confirmadas.' }
  }

  const fornErr = await assertFornecedorDaLojaOc(supabase, lojaId, input.fornecedor_id)
  if (fornErr) return { success: false, error: fornErr }

  // UX-04: pedido que já recebeu mercadoria não pode ter os itens refeitos (o histórico de
  // entradas aponta para as linhas). O banco também recusa (FK RESTRICT + guarda de recebido).
  const { count: comRecebimento } = await supabase
    .from('ordens_compra_itens')
    .select('id', { count: 'exact', head: true })
    .eq('ordem_id', input.id)
    .gt('quantidade_recebida', 0)
  if ((comRecebimento ?? 0) > 0) {
    return {
      success: false,
      error: 'Este pedido já recebeu mercadoria e não pode mais ser editado. Se faltar algo, use "Encerrar com falta".',
    }
  }

  const { error: e1 } = await supabase
    .from('ordens_compra')
    .update({
      fornecedor_id: input.fornecedor_id ?? null,
      fornecedor_nome: input.fornecedor_nome?.trim() || null,
      data_emissao: input.data_emissao ?? new Date().toISOString().slice(0, 10),
      data_prevista_chegada: input.data_prevista_chegada ?? null,
      observacao: input.observacao?.trim() || null,
    })
    .eq('id', input.id)
    .eq('loja_id', lojaId)

  if (e1) return { success: false, error: mensagemErroComSecao('Ordem de compra', e1.message) }

  const { error: eDel } = await supabase.from('ordens_compra_itens').delete().eq('ordem_id', input.id)
  if (eDel) {
    return { success: false, error: mensagemErroOc(eDel.message) ?? mensagemErroComSecao('Itens da ordem', eDel.message) }
  }

  const itensRows = input.itens.map((i) => ({
    ordem_id: input.id,
    produto_id: i.produto_id ?? null,
    descricao: i.descricao?.trim() || null,
    quantidade: i.quantidade,
    preco_unitario: i.preco_unitario,
    unidade_medida: i.unidade_medida,
  }))

  const { error: e2 } = await supabase.from('ordens_compra_itens').insert(itensRows)
  if (e2) return { success: false, error: mensagemErroComSecao('Itens da ordem', e2.message) }

  revalidatePath('/gerente/compras')
  return { success: true, data: null }
}

export async function atualizarStatusOC(id: string, novoStatus: StatusOC): Promise<R<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Loja não identificada.' }

  const supabase = await createClient()

  const { data: existing, error: eCheck } = await supabase
    .from('ordens_compra')
    .select('status')
    .eq('id', id)
    .eq('loja_id', lojaId)
    .single()

  if (eCheck || !existing) return { success: false, error: 'Ordem não encontrada.' }

  const statusAtual = existing.status as StatusOC
  if (!STATUS_TRANSITIONS[statusAtual].includes(novoStatus)) {
    return { success: false, error: 'Transição de status inválida.' }
  }

  const { error } = await supabase
    .from('ordens_compra')
    .update({ status: novoStatus })
    .eq('id', id)
    .eq('loja_id', lojaId)

  if (error) {
    return { success: false, error: mensagemErroOc(error.message) ?? mensagemErroComSecao('Status', error.message) }
  }

  revalidatePath('/gerente/compras')
  return { success: true, data: null }
}

export type RegistrarRecebimentoOcResult = OcEntradaResultado & {
  /** Texto operacional pronto para o toast: o que entrou, quanto falta, se o pedido fechou. */
  mensagem: string
}

/**
 * UX-04 — recebe mercadoria PELO pedido. `quantidade_recebida` de cada item é o que chegou NESTA
 * entrega (não o acumulado). O banco (`receber_ordem_compra`) trava o pedido, recusa acima do saldo,
 * é idempotente por `idempotencyKey` e só fecha o pedido quando o saldo zera.
 */
export async function registrarRecebimentoOC(
  ocId: string,
  itensRecebidos: Array<{ item_id: string; quantidade_recebida: number }>,
  idempotencyKey: string,
): Promise<R<RegistrarRecebimentoOcResult>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Loja não identificada.' }

  const key = idempotencyKey?.trim()
  if (!key || key.length > 128) {
    return { success: false, error: 'Não foi possível identificar esta tentativa de recebimento. Atualize a tela e tente de novo.' }
  }

  // Só o que chegou entra: itens com 0 não são enviados (o banco recusa entrada totalmente zerada).
  const itens = itensRecebidos
    .filter((i) => Number.isFinite(i.quantidade_recebida) && i.quantidade_recebida > 0)
    .map((i) => ({ item_id: i.item_id, quantidade_conferida: i.quantidade_recebida }))
  if (itens.length === 0) {
    return { success: false, error: 'Informe a quantidade que chegou em pelo menos um item.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('receber_ordem_compra', {
    p_oc_id: ocId,
    p_itens: itens,
    p_idempotency_key: key,
  })

  if (error) {
    return { success: false, error: mensagemErroOc(error.message) ?? mensagemErroComSecao('Recebimento', error.message) }
  }

  const r = data as unknown as OcResumoRecebimento & {
    replay?: boolean
    entrada_id?: string | null
    quantidade_creditada?: number
  }
  const creditado = Number(r.quantidade_creditada ?? 0)
  const resultado: OcEntradaResultado = {
    ...r,
    replay: r.replay === true,
    entrada_id: r.entrada_id ?? null,
    quantidade_creditada: creditado,
  }

  revalidatePath('/gerente/compras')
  revalidatePath('/admin/compras')
  revalidatePath('/gerente/estoque')
  return {
    success: true,
    data: {
      ...resultado,
      mensagem: resultado.replay
        ? 'Este recebimento já tinha sido registrado — o estoque não foi creditado de novo.'
        : mensagemPosEntradaOc(resultado, creditado),
    },
  }
}

/**
 * UX-04 — "Encerrar com falta": o fornecedor não vai completar o pedido. Encerra só o saldo
 * restante (o recebido permanece), com motivo/autor/data auditáveis. Não mexe em estoque nem custo.
 */
export async function encerrarOrdemCompraComFalta(
  ocId: string,
  motivo: string,
): Promise<R<OcResumoRecebimento>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Loja não identificada.' }

  const texto = motivo?.trim() ?? ''
  if (texto.length < 5) {
    return { success: false, error: 'Informe o motivo do encerramento (mínimo de 5 caracteres).' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('encerrar_ordem_compra_com_falta', {
    p_oc_id: ocId,
    p_motivo: texto,
  })
  if (error) {
    return { success: false, error: mensagemErroOc(error.message) ?? mensagemErroComSecao('Encerramento', error.message) }
  }

  revalidatePath('/gerente/compras')
  revalidatePath('/admin/compras')
  return { success: true, data: data as unknown as OcResumoRecebimento }
}
