'use server'

import { createClient } from '@/lib/supabase/server'
import { clearStaleSessionIfNeeded } from '@/lib/auth/staleSession'
import { cancelarVenda } from '@/app/caixa/actions'
import { parseCancelarVendaGerenteForm } from '@/app/gerente/vendas/parseCancelarVendaGerenteForm'

export type VendaListRow = {
  id: string
  data: string | null
  total_liquido: number | null
  total_bruto: number | null
  forma_pagamento: string | null
  status: string | null
  caixa_id: string | null
  qtd_itens_total: number
  qtd_itens_distintos: number
  primeiro_produto: string | null
}

type RawProduto = { nome: string | null } | Array<{ nome: string | null }> | null
type RawItem = { quantidade: number | null; produto: RawProduto }
type RawVenda = {
  id: string
  data: string | null
  total_liquido: number | null
  total_bruto: number | null
  forma_pagamento: string | null
  status: string | null
  caixa_id: string | null
  itens_venda: RawItem[] | null
}

const VENDAS_SELECT = `
  id, data, total_liquido, total_bruto, forma_pagamento, status, caixa_id,
  itens_venda ( quantidade, produto:produtos!itens_venda_produto_id_fkey ( nome ) )
` as const

function nomeProduto(p: RawProduto): string | null {
  if (!p) return null
  if (Array.isArray(p)) return p[0]?.nome?.trim() || null
  return p.nome?.trim() || null
}

function mapVenda(raw: RawVenda): VendaListRow {
  const itens = raw.itens_venda ?? []
  let qtdTotal = 0
  let primeiroNome: string | null = null
  for (const it of itens) {
    qtdTotal += Number(it.quantidade ?? 0)
    if (!primeiroNome) primeiroNome = nomeProduto(it.produto)
  }
  return {
    id: raw.id,
    data: raw.data,
    total_liquido: raw.total_liquido,
    total_bruto: raw.total_bruto,
    forma_pagamento: raw.forma_pagamento,
    status: raw.status,
    caixa_id: raw.caixa_id,
    qtd_itens_total: qtdTotal,
    qtd_itens_distintos: itens.length,
    primeiro_produto: primeiroNome,
  }
}

export type VendasFiltro = Readonly<{
  inicio: string | null
  fim: string | null
  status: ReadonlyArray<string>
  formaPagamento: ReadonlyArray<string>
}>

export const FILTRO_VENDAS_VAZIO: VendasFiltro = {
  inicio: null,
  fim: null,
  status: [],
  formaPagamento: [],
}

export type VendasKpisDTO = Readonly<{
  faturado: number
  qtdConcluidas: number
  ticketMedio: number
  qtdCanceladas: number
  valorCanceladas: number
}>

const PAGE_SIZE = 20

async function createVendasSupabaseClient() {
  const supabase = await createClient()
  const { error: authError } = await supabase.auth.getUser()
  if (authError) {
    if (await clearStaleSessionIfNeeded(supabase, authError)) return null
    throw authError
  }
  return supabase
}

export async function buscarVendasPaginadasAction(
  page: number,
  filtros: VendasFiltro = FILTRO_VENDAS_VAZIO,
): Promise<{ ok: true; vendas: VendaListRow[]; hasMore: boolean } | { ok: false; error: string }> {
  try {
    const supabase = await createVendasSupabaseClient()
    if (!supabase) {
      return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    }
    let query = supabase
      .from('vendas')
      .select(VENDAS_SELECT)
      .order('data', { ascending: false })

    if (filtros.inicio) query = query.gte('data', filtros.inicio)
    if (filtros.fim) query = query.lte('data', filtros.fim)
    if (filtros.status.length > 0) query = query.in('status', [...filtros.status])
    if (filtros.formaPagamento.length > 0) {
      query = query.in('forma_pagamento', [...filtros.formaPagamento])
    }

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE // fetch one extra to determine hasMore
    const { data, error } = await query.range(from, to)

    if (error) return { ok: false, error: error.message }

    const raw = (data ?? []) as unknown as RawVenda[]
    const hasMore = raw.length > PAGE_SIZE
    const vendas = (hasMore ? raw.slice(0, PAGE_SIZE) : raw).map(mapVenda)
    return { ok: true, vendas, hasMore }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao buscar vendas.' }
  }
}

/**
 * KPIs agregados respeitando período e pagamento — status é ignorado de propósito
 * para sempre mostrar o breakdown completo (concluídas vs. canceladas).
 */
export async function obterKpisVendas(
  filtros: VendasFiltro = FILTRO_VENDAS_VAZIO,
): Promise<VendasKpisDTO> {
  const vazio: VendasKpisDTO = {
    faturado: 0,
    qtdConcluidas: 0,
    ticketMedio: 0,
    qtdCanceladas: 0,
    valorCanceladas: 0,
  }
  try {
    const supabase = await createVendasSupabaseClient()
    if (!supabase) return vazio
    let query = supabase.from('vendas').select('total_liquido, status')

    if (filtros.inicio) query = query.gte('data', filtros.inicio)
    if (filtros.fim) query = query.lte('data', filtros.fim)
    if (filtros.formaPagamento.length > 0) {
      query = query.in('forma_pagamento', [...filtros.formaPagamento])
    }

    const { data, error } = await query
    if (error || !data) return vazio

    let faturado = 0
    let qtdConcluidas = 0
    let qtdCanceladas = 0
    let valorCanceladas = 0
    for (const r of data as Array<{ total_liquido: number | null; status: string | null }>) {
      const valor = Number(r.total_liquido ?? 0)
      const st = String(r.status ?? '').toUpperCase()
      if (st === 'CONCLUIDA') {
        faturado += valor
        qtdConcluidas++
      } else if (st === 'CANCELADA') {
        valorCanceladas += valor
        qtdCanceladas++
      }
    }
    return {
      faturado,
      qtdConcluidas,
      ticketMedio: qtdConcluidas > 0 ? faturado / qtdConcluidas : 0,
      qtdCanceladas,
      valorCanceladas,
    }
  } catch {
    return vazio
  }
}

const EXPORT_PAGE = 400
const EXPORT_MAX_ROWS = 12_000

/**
 * Busca todas as vendas que casam com os filtros, paginando server-side em chunks.
 * Usado pelo botão "Exportar CSV" para exportar a visão completa (não só o que
 * o scroll infinito já carregou). Possui teto de segurança em EXPORT_MAX_ROWS.
 */
export async function obterVendasCompletaParaExport(
  filtros: VendasFiltro = FILTRO_VENDAS_VAZIO,
): Promise<VendaListRow[]> {
  const acc: VendaListRow[] = []
  try {
    const supabase = await createClient()
    let offset = 0
    while (acc.length < EXPORT_MAX_ROWS) {
      let query = supabase
        .from('vendas')
        .select(VENDAS_SELECT)
        .order('data', { ascending: false })

      if (filtros.inicio) query = query.gte('data', filtros.inicio)
      if (filtros.fim) query = query.lte('data', filtros.fim)
      if (filtros.status.length > 0) query = query.in('status', [...filtros.status])
      if (filtros.formaPagamento.length > 0) {
        query = query.in('forma_pagamento', [...filtros.formaPagamento])
      }

      const { data, error } = await query.range(offset, offset + EXPORT_PAGE - 1)
      if (error || !data || data.length === 0) break

      const raw = data as unknown as RawVenda[]
      acc.push(...raw.map(mapVenda))
      if (raw.length < EXPORT_PAGE) break
      offset += EXPORT_PAGE
    }
  } catch {
    // retorna parcial se algo der errado no meio dos chunks
  }
  return acc
}

export async function cancelarVendaGerenteAction(formData: FormData) {
  const parsed = parseCancelarVendaGerenteForm(formData)
  if (!parsed) return
  await cancelarVenda(parsed.vendaId, parsed.motivo)
}
