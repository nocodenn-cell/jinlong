import type { SupabaseClient } from '@supabase/supabase-js'
import { createReceivableReader } from '@/app/admin/financeiro/receivableReader'

/** Filtros da listagem de contas a receber (sincronizados com a URL). */
export type FinanceiroTituloFilters = {
  opcao: 'mix' | 'ABERTO' | 'PARCIAL'
  nomeCliente: string
  q: string
  de: string
  ate: string
}

export const DEFAULT_FIN_TITULO_FILTERS: FinanceiroTituloFilters = {
  opcao: 'mix',
  nomeCliente: '',
  q: '',
  de: '',
  ate: '',
}

export type FinanceiroTituloListaRow = {
  id: string
  valor_total: number
  valor_aberto: number
  status: string
  descricao: string | null
  vencimento: string | null
  cliente_id: string
  cliente_nome: string | null
}

function pickParam(raw: Record<string, string | string[] | undefined>, key: string): string {
  const v = raw[key]
  if (Array.isArray(v)) return (v[0] ?? '').trim()
  return (v ?? '').trim()
}

/** Lê `searchParams` da rota `/gerente/financeiro` (Next App Router). */
export function parseTituloFiltersFromSearchParams(
  raw: Record<string, string | string[] | undefined>,
): FinanceiroTituloFilters & { limite: number } {
  let opcao = pickParam(raw, 'opcao')
  if (opcao !== 'mix' && opcao !== 'ABERTO' && opcao !== 'PARCIAL') opcao = 'mix'

  let limite = Number.parseInt(pickParam(raw, 'limite'), 10)
  if (!Number.isFinite(limite)) limite = 200
  limite = Math.min(500, Math.max(50, limite))

  return {
    opcao: opcao as FinanceiroTituloFilters['opcao'],
    nomeCliente: pickParam(raw, 'cliente').slice(0, 200),
    q: pickParam(raw, 'q').slice(0, 200),
    de: pickParam(raw, 'de').slice(0, 12),
    ate: pickParam(raw, 'ate').slice(0, 12),
    limite,
  }
}

export function serializeTituloFiltersToSearchParams(
  f: FinanceiroTituloFilters,
  limite: number,
): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.opcao !== 'mix') sp.set('opcao', f.opcao)
  if (f.nomeCliente.trim()) sp.set('cliente', f.nomeCliente.trim())
  if (f.q.trim()) sp.set('q', f.q.trim())
  if (f.de.trim()) sp.set('de', f.de.trim())
  if (f.ate.trim()) sp.set('ate', f.ate.trim())
  if (limite !== 200) sp.set('limite', String(limite))
  return sp
}

export function isDefaultTituloFilters(f: FinanceiroTituloFilters): boolean {
  return (
    f.opcao === 'mix' &&
    !f.nomeCliente.trim() &&
    !f.q.trim() &&
    !f.de.trim() &&
    !f.ate.trim()
  )
}

/**
 * Listagem com filtros no Postgres via ReceivableReader (ADR-010).
 * `limite+1` linhas são lidas no adapter para detectar truncagem.
 */
export async function fetchContasReceberListagem(
  supabase: SupabaseClient,
  filters: FinanceiroTituloFilters,
  limite: number,
): Promise<{ titulos: FinanceiroTituloListaRow[]; capped: boolean }> {
  const reader = createReceivableReader(supabase)
  const result = await reader.list({
    opcao: filters.opcao,
    nomeCliente: filters.nomeCliente,
    q: filters.q,
    de: filters.de,
    ate: filters.ate,
    limite,
  })
  if (!result.ok) {
    return { titulos: [], capped: false }
  }
  return {
    titulos: result.titulos.map((t) => ({
      id: t.tituloId,
      valor_total: t.valorTotal,
      valor_aberto: t.valorAberto,
      status: t.status,
      descricao: t.descricao,
      vencimento: t.vencimento,
      cliente_id: t.clienteId,
      cliente_nome: t.clienteNome,
    })),
    capped: result.capped,
  }
}

export const FIN_KPI_SOMA_CAP = 8000

const KPI_SUM_CAP = FIN_KPI_SOMA_CAP

/** KPIs globais (não dependem dos filtros da tabela). */
export async function fetchFinanceiroTitulosKpis(supabase: SupabaseClient): Promise<{
  titulosAbertosCount: number
  valorAbertoTotal: number
  kpiValorTruncado: boolean
}> {
  const { count } = await supabase
    .from('contas_receber')
    .select('*', { count: 'exact', head: true })
    .in('status', ['ABERTO', 'PARCIAL'])

  const { data: vals } = await supabase
    .from('contas_receber')
    .select('valor_aberto')
    .in('status', ['ABERTO', 'PARCIAL'])
    .limit(KPI_SUM_CAP + 1)

  const rows = vals ?? []
  const kpiValorTruncado = rows.length > KPI_SUM_CAP
  const slice = kpiValorTruncado ? rows.slice(0, KPI_SUM_CAP) : rows
  const valorAbertoTotal = slice.reduce((s, r) => s + Number(r.valor_aberto ?? 0), 0)
  return {
    titulosAbertosCount: count ?? 0,
    valorAbertoTotal,
    kpiValorTruncado,
  }
}
