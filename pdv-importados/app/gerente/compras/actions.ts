'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

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
  observacao: string | null
  total_itens: number
  valor_total: number
  created_at: string
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
  observacao?: string | null
  itens: OcItemInput[]
}

export type AtualizarOcInput = CriarOcInput & { id: string }

type OcItemRpcInput = {
  produto_id: string | null
  descricao: string | null
  quantidade: number
  preco_unitario: number
  unidade_medida: string
}

async function lojaDoUsuario(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('loja_id')
    .eq('id', user.id)
    .maybeSingle()
  return (data?.loja_id as string | undefined) ?? LOJA_MATRIZ_ID
}

type RawOcItem = { quantidade: number; preco_unitario: number }
type RawOcRow = {
  id: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  status: string
  data_emissao: string
  data_prevista_chegada: string | null
  observacao: string | null
  created_at: string
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
  }
}

function mapOcItemRpcInput(item: OcItemInput): OcItemRpcInput {
  return {
    produto_id: item.produto_id ?? null,
    descricao: item.descricao?.trim() || null,
    quantidade: item.quantidade,
    preco_unitario: item.preco_unitario,
    unidade_medida: item.unidade_medida,
  }
}

const OC_SELECT = `
  id, fornecedor_id, fornecedor_nome, status,
  data_emissao, data_prevista_chegada, observacao, created_at,
  fornecedor:fornecedores!fornecedor_id(nome),
  itens:ordens_compra_itens(quantidade, preco_unitario)
`

const OC_DETALHE_SELECT = `
  id, fornecedor_id, fornecedor_nome, status,
  data_emissao, data_prevista_chegada, observacao, created_at,
  fornecedor:fornecedores!fornecedor_id(nome),
  itens:ordens_compra_itens(
    id, produto_id, descricao, quantidade, preco_unitario,
    quantidade_recebida, unidade_medida,
    produto:produtos!produto_id(nome)
  )
`

export async function obterKpisCompras(): Promise<OcKpisDTO> {
  const auth = await assertGerenteOuDono()
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
  const auth = await assertGerenteOuDono()
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
  const auth = await assertGerenteOuDono()
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
    unidade_medida: i.unidade_medida,
  }))

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
    itens,
  }

  return { success: true, data: dto }
}

export async function criarOrdemCompra(input: CriarOcInput): Promise<R<string>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!input.itens.length) return { success: false, error: 'Adicione ao menos um item.' }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Loja não identificada.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Faça login novamente.' }

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
      created_by: user.id,
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
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!input.itens.length) return { success: false, error: 'Adicione ao menos um item.' }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Loja não identificada.' }

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

  const { error } = await supabase.rpc('atualizar_ordem_compra_transacional', {
    p_ordem_id: input.id,
    p_fornecedor_id: input.fornecedor_id ?? null,
    p_fornecedor_nome: input.fornecedor_nome?.trim() || null,
    p_data_emissao: input.data_emissao ?? new Date().toISOString().slice(0, 10),
    p_data_prevista_chegada: input.data_prevista_chegada ?? null,
    p_observacao: input.observacao?.trim() || null,
    p_itens: input.itens.map(mapOcItemRpcInput),
  })

  if (error) return { success: false, error: mensagemErroComSecao('Ordem de compra', error.message) }

  revalidatePath('/gerente/compras')
  return { success: true, data: null }
}

export async function atualizarStatusOC(id: string, novoStatus: StatusOC): Promise<R<null>> {
  const auth = await assertGerenteOuDono()
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
  return { success: true, data: null }
}

export async function registrarRecebimentoOC(
  ocId: string,
  itensRecebidos: Array<{ item_id: string; quantidade_recebida: number }>,
): Promise<R<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaDoUsuario()
  if (!lojaId) return { success: false, error: 'Loja não identificada.' }

  const supabase = await createClient()

  const { data: oc, error: eOc } = await supabase
    .from('ordens_compra')
    .select('status')
    .eq('id', ocId)
    .eq('loja_id', lojaId)
    .single()

  if (eOc || !oc) return { success: false, error: 'Ordem não encontrada.' }
  if (oc.status !== 'EM_TRANSITO') {
    return { success: false, error: 'Só é possível registrar recebimento em ordens em trânsito.' }
  }

  for (const item of itensRecebidos) {
    const { error } = await supabase
      .from('ordens_compra_itens')
      .update({ quantidade_recebida: item.quantidade_recebida })
      .eq('id', item.item_id)
      .eq('ordem_id', ocId)

    if (error) return { success: false, error: mensagemErroComSecao('Recebimento', error.message) }
  }

  const { data: todosItens } = await supabase
    .from('ordens_compra_itens')
    .select('quantidade, quantidade_recebida')
    .eq('ordem_id', ocId)

  const todosRecebidos = (todosItens ?? []).every(
    (i) => (i.quantidade_recebida ?? 0) >= i.quantidade,
  )

  if (todosRecebidos) {
    await supabase
      .from('ordens_compra')
      .update({ status: 'RECEBIDA' })
      .eq('id', ocId)
      .eq('loja_id', lojaId)
  }

  revalidatePath('/gerente/compras')
  return { success: true, data: null }
}
