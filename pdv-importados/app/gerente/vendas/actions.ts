'use server'

import { createClient } from '@/lib/supabase/server'
import { clearStaleSessionIfNeeded } from '@/lib/auth/staleSession'
import { cancelarVenda } from '@/app/caixa/actions'
import { parseCancelarVendaGerenteForm } from '@/app/gerente/vendas/parseCancelarVendaGerenteForm'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { getGerenteLojaId } from '@/lib/gerente/auth/sessionContext'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'

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

export type VendasFiltro = Readonly<{
  inicio: string | null
  fim: string | null
  status: ReadonlyArray<string>
  formaPagamento: ReadonlyArray<string>
}>

const FILTRO_VENDAS_VAZIO: VendasFiltro = {
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

type RpcEventRow = {
  event_id: string
  sale_id: string
  event_type: string
  occurred_at: string
  total: number
  total_bruto: number | null
  forma_pagamento: string | null
  caixa_id: string
  operador_id: string
  items: unknown
  qtd_itens_total: number
  qtd_itens_distintos: number
  primeiro_produto: string | null
}

type RpcKpiRow = {
  faturado: number
  qtd_concluidas: number
  ticket_medio: number
  qtd_canceladas: number
  valor_canceladas: number
}

async function createVendasSupabaseClient() {
  const supabase = await createClient()
  const { error: authError } = await supabase.auth.getUser()
  if (authError) {
    if (await clearStaleSessionIfNeeded(supabase, authError)) return null
    throw authError
  }
  return supabase
}

function eventTypesFromFiltro(status: ReadonlyArray<string>): string[] {
  if (status.length === 0) return ['SALE_REGISTERED', 'SALE_CANCELLED']
  const types: string[] = []
  if (status.some((s) => String(s).toUpperCase() === 'CONCLUIDA')) types.push('SALE_REGISTERED')
  if (status.some((s) => String(s).toUpperCase() === 'CANCELADA')) types.push('SALE_CANCELLED')
  return types.length > 0 ? types : ['SALE_REGISTERED', 'SALE_CANCELLED']
}

function mapEventRow(raw: RpcEventRow): VendaListRow {
  return {
    id: raw.sale_id,
    data: raw.occurred_at,
    total_liquido: raw.total,
    total_bruto: raw.total_bruto,
    forma_pagamento: raw.forma_pagamento,
    status: raw.event_type === 'SALE_CANCELLED' ? 'CANCELADA' : 'CONCLUIDA',
    caixa_id: raw.caixa_id,
    qtd_itens_total: Number(raw.qtd_itens_total ?? 0),
    qtd_itens_distintos: Number(raw.qtd_itens_distintos ?? 0),
    primeiro_produto: raw.primeiro_produto,
  }
}

async function resolveLojaId(): Promise<string | null> {
  return (await getGerenteLojaId()) ?? LOJA_MATRIZ_ID
}

export async function buscarVendasPaginadasAction(
  page: number,
  filtros: VendasFiltro = FILTRO_VENDAS_VAZIO,
): Promise<{ ok: true; vendas: VendaListRow[]; hasMore: boolean } | { ok: false; error: string }> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  try {
    const supabase = await createVendasSupabaseClient()
    if (!supabase) {
      return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    }

    const lojaId = await resolveLojaId()
    if (!lojaId) return { ok: false, error: 'Não foi possível identificar a loja.' }

    const offset = (page - 1) * PAGE_SIZE
    const { data, error } = await supabase.rpc('listar_venda_eventos_gerente', {
      p_loja_id: lojaId,
      p_inicio: filtros.inicio,
      p_fim: filtros.fim,
      p_event_types: eventTypesFromFiltro(filtros.status),
      p_formas_pagamento:
        filtros.formaPagamento.length > 0 ? [...filtros.formaPagamento] : null,
      p_offset: offset,
      p_limit: PAGE_SIZE + 1,
    })

    if (error) return { ok: false, error: error.message }

    const raw = (data ?? []) as RpcEventRow[]
    const hasMore = raw.length > PAGE_SIZE
    const vendas = (hasMore ? raw.slice(0, PAGE_SIZE) : raw).map(mapEventRow)
    return { ok: true, vendas, hasMore }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao buscar vendas.' }
  }
}

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
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return vazio

  try {
    const supabase = await createVendasSupabaseClient()
    if (!supabase) return vazio

    const lojaId = await resolveLojaId()
    if (!lojaId) return vazio

    const { data, error } = await supabase.rpc('kpis_venda_eventos_gerente', {
      p_loja_id: lojaId,
      p_inicio: filtros.inicio,
      p_fim: filtros.fim,
      p_formas_pagamento:
        filtros.formaPagamento.length > 0 ? [...filtros.formaPagamento] : null,
    })

    if (error || !data) return vazio

    const row = (Array.isArray(data) ? data[0] : data) as RpcKpiRow | undefined
    if (!row) return vazio

    return {
      faturado: Number(row.faturado ?? 0),
      qtdConcluidas: Number(row.qtd_concluidas ?? 0),
      ticketMedio: Number(row.ticket_medio ?? 0),
      qtdCanceladas: Number(row.qtd_canceladas ?? 0),
      valorCanceladas: Number(row.valor_canceladas ?? 0),
    }
  } catch {
    return vazio
  }
}

const EXPORT_PAGE = 400
const EXPORT_MAX_ROWS = 12_000

export async function obterVendasCompletaParaExport(
  filtros: VendasFiltro = FILTRO_VENDAS_VAZIO,
): Promise<VendaListRow[]> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return []

  const acc: VendaListRow[] = []
  try {
    const supabase = await createClient()
    const lojaId = await resolveLojaId()
    if (!lojaId) return []

    let offset = 0
    while (acc.length < EXPORT_MAX_ROWS) {
      const { data, error } = await supabase.rpc('listar_venda_eventos_gerente', {
        p_loja_id: lojaId,
        p_inicio: filtros.inicio,
        p_fim: filtros.fim,
        p_event_types: eventTypesFromFiltro(filtros.status),
        p_formas_pagamento:
          filtros.formaPagamento.length > 0 ? [...filtros.formaPagamento] : null,
        p_offset: offset,
        p_limit: EXPORT_PAGE,
      })

      if (error || !data || data.length === 0) break

      const raw = data as RpcEventRow[]
      acc.push(...raw.map(mapEventRow))
      if (raw.length < EXPORT_PAGE) break
      offset += EXPORT_PAGE
    }
  } catch {
    // retorna parcial
  }
  return acc
}

export async function cancelarVendaGerenteAction(formData: FormData) {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return
  const parsed = parseCancelarVendaGerenteForm(formData)
  if (!parsed) return
  await cancelarVenda(parsed.vendaId, parsed.motivo)
}
