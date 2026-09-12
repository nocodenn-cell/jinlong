'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { getGerenteLojaId, getGerenteUserId } from '@/lib/gerente/auth/sessionContext'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { lojaIdDaSessao } from '@/app/gerente/fornecedores/fornecedorContrato'
import { mensagemSeFornecedorForaDaLoja } from './fornecedorOcBoundary'
import { ROUTES } from '@shared-core/navigation/routes'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

export type StatusOC = 'RASCUNHO' | 'CONFIRMADA' | 'EM_TRANSITO' | 'RECEBIDA' | 'CANCELADA'

const STATUS_TRANSITIONS: Record<StatusOC, StatusOC[]> = {
  RASCUNHO: ['CONFIRMADA', 'CANCELADA'],
  CONFIRMADA: ['EM_TRANSITO', 'CANCELADA'],
  EM_TRANSITO: ['RECEBIDA', 'CANCELADA'],
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
  unidade_medida: string
}

export type OcListaDTO = {
  id: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  status: StatusOC
  data_emissao: string
  data_prevista_chegada: string | null
  /** Prazo acordado; sem ele o recebimento não gera conta a pagar. */
  data_vencimento: string | null
  observacao: string | null
  total_itens: number
  valor_total: number
  created_at: string
  /**
   * NF-e vinculada a esta ordem (`importacoes_nfe.ordem_compra_id`), se houver.
   * O vínculo e as guardas de dupla entrada já existiam no banco desde
   * `20260911140000`; o que faltava era a operação ENXERGAR isso. Sem exibir,
   * o operador só descobria a nota ao clicar em Receber e tomar
   * `OC_NFE_JA_CREDITADA` como erro cru.
   */
  nfe_id: string | null
  nfe_numero: string | null
  nfe_status: string | null
  /**
   * Título gerado em `contas_pagar` pelo recebimento (`ordem_compra_id`).
   * É a consequência financeira da compra, e ela também não aparecia.
   */
  titulo_id: string | null
  titulo_status: string | null
  titulo_valor: number | null
}

export type OcDetalheDTO = OcListaDTO & {
  itens: OcItemDTO[]
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
  data_vencimento?: string | null
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

type RawOcItem = { quantidade: number; preco_unitario: number }
type RawVinculoNfe = { id: string; numero_nf: string | null; status: string | null }
type RawTituloAp = { id: string; status: string | null; valor_total: number | null }
type RawOcRow = {
  id: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  status: string
  data_emissao: string
  data_prevista_chegada: string | null
  /** Prazo acordado; sem ele o recebimento não gera conta a pagar. */
  data_vencimento: string | null
  observacao: string | null
  created_at: string
  fornecedor: { nome: string } | null
  itens: RawOcItem[]
  /** PostgREST devolve o embed 1-N como array, mesmo com índice único. */
  nfe?: RawVinculoNfe[] | RawVinculoNfe | null
  titulo?: RawTituloAp[] | RawTituloAp | null
}

function primeiro<T>(v: T[] | T | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
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
    data_vencimento: row.data_vencimento,
    observacao: row.observacao,
    total_itens: itens.length,
    valor_total: itens.reduce((sum, i) => sum + i.quantidade * i.preco_unitario, 0),
    created_at: row.created_at,
    nfe_id: primeiro(row.nfe)?.id ?? null,
    nfe_numero: primeiro(row.nfe)?.numero_nf ?? null,
    nfe_status: primeiro(row.nfe)?.status ?? null,
    titulo_id: primeiro(row.titulo)?.id ?? null,
    titulo_status: primeiro(row.titulo)?.status ?? null,
    titulo_valor: primeiro(row.titulo)?.valor_total ?? null,
  }
}

const OC_SELECT = `
  id, fornecedor_id, fornecedor_nome, status,
  data_emissao, data_prevista_chegada, data_vencimento, observacao, created_at,
  fornecedor:fornecedores!fornecedor_id(nome),
  nfe:importacoes_nfe!importacoes_nfe_ordem_compra_id_fkey(id, numero_nf, status),
  titulo:contas_pagar!contas_pagar_ordem_compra_id_fkey(id, status, valor_total),
  itens:ordens_compra_itens(quantidade, preco_unitario)
`

const OC_DETALHE_SELECT = `
  id, fornecedor_id, fornecedor_nome, status,
  data_emissao, data_prevista_chegada, data_vencimento, observacao, created_at,
  fornecedor:fornecedores!fornecedor_id(nome),
  nfe:importacoes_nfe!importacoes_nfe_ordem_compra_id_fkey(id, numero_nf, status),
  titulo:contas_pagar!contas_pagar_ordem_compra_id_fkey(id, status, valor_total),
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
      .select('itens:ordens_compra_itens(quantidade, preco_unitario)')
      .eq('loja_id', lojaId)
      .eq('status', 'EM_TRANSITO'),
  ])

  const rows = statusRows ?? []
  const total_rascunho = rows.filter((r) => r.status === 'RASCUNHO').length
  const total_confirmadas = rows.filter((r) => r.status === 'CONFIRMADA').length
  const total_em_transito = rows.filter((r) => r.status === 'EM_TRANSITO').length

  const valor_em_transito = (transitoOrdens ?? []).reduce((sum, oc) => {
    const ocItens = (oc.itens as RawOcItem[]) ?? []
    return sum + ocItens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
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

  if (input.busca?.trim()) {
    const b = `%${input.busca.trim()}%`
    q = q.or(`fornecedor_nome.ilike.${b},id.ilike.${b}`)
  }

  const { data, error, count } = await q

  if (error) return { rows: [], total: 0 }

  return {
    rows: (data as unknown as RawOcRow[]).map(mapOcListaRow),
    total: count ?? 0,
  }
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
    data_vencimento: string | null
    observacao: string | null
    created_at: string
    fornecedor: { nome: string } | null
    itens: RawDetalheItem[]
    nfe?: RawVinculoNfe[] | RawVinculoNfe | null
    titulo?: RawTituloAp[] | RawTituloAp | null
  }

  const itens: OcItemDTO[] = (raw.itens ?? []).map((i) => ({
    id: i.id,
    produto_id: i.produto_id,
    produto_nome: i.produto?.nome ?? null,
    descricao: i.descricao,
    quantidade: i.quantidade,
    preco_unitario: i.preco_unitario,
    quantidade_recebida: i.quantidade_recebida,
    unidade_medida: i.unidade_medida,
  }))

  const dto: OcDetalheDTO = {
    id: raw.id,
    fornecedor_id: raw.fornecedor_id,
    fornecedor_nome: raw.fornecedor?.nome ?? raw.fornecedor_nome ?? null,
    status: raw.status as StatusOC,
    data_emissao: raw.data_emissao,
    data_prevista_chegada: raw.data_prevista_chegada,
    data_vencimento: raw.data_vencimento,
    observacao: raw.observacao,
    total_itens: itens.length,
    valor_total: itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0),
    nfe_id: primeiro(raw.nfe)?.id ?? null,
    nfe_numero: primeiro(raw.nfe)?.numero_nf ?? null,
    nfe_status: primeiro(raw.nfe)?.status ?? null,
    titulo_id: primeiro(raw.titulo)?.id ?? null,
    titulo_status: primeiro(raw.titulo)?.status ?? null,
    titulo_valor: primeiro(raw.titulo)?.valor_total ?? null,
    created_at: raw.created_at,
    itens,
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
      data_vencimento: input.data_vencimento ?? null,
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
  revalidatePath(ROUTES.admin.compras)
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

  const { error: e1 } = await supabase
    .from('ordens_compra')
    .update({
      fornecedor_id: input.fornecedor_id ?? null,
      fornecedor_nome: input.fornecedor_nome?.trim() || null,
      data_emissao: input.data_emissao ?? new Date().toISOString().slice(0, 10),
      data_prevista_chegada: input.data_prevista_chegada ?? null,
      data_vencimento: input.data_vencimento ?? null,
      observacao: input.observacao?.trim() || null,
    })
    .eq('id', input.id)
    .eq('loja_id', lojaId)

  if (e1) return { success: false, error: mensagemErroComSecao('Ordem de compra', e1.message) }

  await supabase.from('ordens_compra_itens').delete().eq('ordem_id', input.id)

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
  revalidatePath(ROUTES.admin.compras)
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

  if (error) return { success: false, error: mensagemErroComSecao('Status', error.message) }

  revalidatePath('/gerente/compras')
  revalidatePath(ROUTES.admin.compras)
  return { success: true, data: null }
}

export async function registrarRecebimentoOC(
  ocId: string,
  itensRecebidos: Array<{ item_id: string; quantidade_recebida: number }>,
): Promise<R<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Loja não identificada.' }

  const supabase = await createClient()

  // FLX-04 (migration 295): receber_ordem_compra(uuid,jsonb) foi substituída por um fluxo
  // de dois passos — conferência física primeiro (grava quantidade_conferida por item),
  // depois recebimento (credita estoque só com base no que já foi conferido).
  const itensConferencia = itensRecebidos.map((i) => ({
    item_id: i.item_id,
    quantidade_conferida: i.quantidade_recebida,
  }))

  const { error: erroConferencia } = await supabase.rpc('registrar_conferencia_ordem_compra', {
    p_oc_id: ocId,
    p_itens: itensConferencia,
  })
  if (erroConferencia) {
    return { success: false, error: mensagemErroComSecao('Conferência', erroConferencia.message) }
  }

  const { error } = await supabase.rpc('receber_ordem_compra', {
    p_oc_id: ocId,
  })

  if (error) return { success: false, error: mensagemErroComSecao('Recebimento', error.message) }

  revalidatePath('/gerente/compras')
  revalidatePath(ROUTES.admin.compras)
  revalidatePath('/gerente/estoque')
  revalidatePath(ROUTES.admin.estoque)
  revalidatePath(ROUTES.admin.financeiro)
  return { success: true, data: null }
}
