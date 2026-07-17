import type { SupabaseClient } from '@supabase/supabase-js'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

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

function escapeIlike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/**
 * Listagem com filtros no Postgres (evita depender só dos N primeiros sem filtro).
 * `limite+1` linhas são lidas para detectar truncagem.
 */
export async function fetchContasReceberListagem(
  supabase: SupabaseClient,
  filters: FinanceiroTituloFilters,
  limite: number,
): Promise<{ titulos: FinanceiroTituloListaRow[]; capped: boolean; error: string | null }> {
  const take = limite + 1
  const falha = (msg: string) => ({
    titulos: [],
    capped: false,
    error: mensagemErroComSecao('Financeiro', msg),
  })

  let idsPorClienteNarrow: string[] | null = null
  const needleCliente = filters.nomeCliente.trim()
  if (needleCliente) {
    const patternNome = `%${escapeIlike(needleCliente)}%`
    const { data: cli, error: eCli } = await supabase
      .from('clientes')
      .select('id')
      .ilike('nome', patternNome)
      .limit(500)
    if (eCli) return falha(eCli.message)
    idsPorClienteNarrow = cli?.map((c) => c.id as string) ?? []
    if (idsPorClienteNarrow.length === 0) {
      return { titulos: [], capped: false, error: null }
    }
  }

  let idsPorBusca: string[] | null = null
  const qNeedle = filters.q.trim()
  if (qNeedle) {
    const pat = `%${escapeIlike(qNeedle)}%`
    const [{ data: byDesc, error: eDesc }, { data: cliQ, error: eCliQ }] = await Promise.all([
      supabase.from('contas_receber').select('id').ilike('descricao', pat).limit(2000),
      supabase.from('clientes').select('id').ilike('nome', pat).limit(500),
    ])
    if (eDesc) return falha(eDesc.message)
    if (eCliQ) return falha(eCliQ.message)
    const fromCliIds = cliQ?.map((c) => c.id as string) ?? []
    let fromClienteTitulos: { id: string }[] = []
    if (fromCliIds.length > 0) {
      const r = await supabase.from('contas_receber').select('id').in('cliente_id', fromCliIds).limit(2000)
      if (r.error) return falha(r.error.message)
      fromClienteTitulos = r.data ?? []
    }
    const set = new Set<string>()
    for (const r of byDesc ?? []) set.add(r.id as string)
    for (const r of fromClienteTitulos) set.add(r.id as string)
    idsPorBusca = [...set]
    if (idsPorBusca.length === 0) {
      return { titulos: [], capped: false, error: null }
    }
    const MAX_IDS_BUSCA = 1200
    if (idsPorBusca.length > MAX_IDS_BUSCA) {
      idsPorBusca = idsPorBusca.slice(0, MAX_IDS_BUSCA)
    }
  }

  let q = supabase
    .from('contas_receber')
    .select('id, valor_total, valor_aberto, status, descricao, vencimento, cliente_id, clientes(nome)')

  if (filters.opcao === 'ABERTO') q = q.eq('status', 'ABERTO')
  else if (filters.opcao === 'PARCIAL') q = q.eq('status', 'PARCIAL')
  else q = q.in('status', ['ABERTO', 'PARCIAL'])

  if (filters.de.trim() && isYmd(filters.de)) {
    q = q.not('vencimento', 'is', null).gte('vencimento', filters.de.trim())
  }
  if (filters.ate.trim() && isYmd(filters.ate)) {
    q = q.not('vencimento', 'is', null).lte('vencimento', filters.ate.trim())
  }

  if (idsPorClienteNarrow) q = q.in('cliente_id', idsPorClienteNarrow)
  if (idsPorBusca) q = q.in('id', idsPorBusca)

  const { data: raw, error: eLista } = await q.order('created_at', { ascending: false }).limit(take)
  if (eLista) return falha(eLista.message)
  const rows = raw ?? []
  const capped = rows.length > limite
  const sliced = capped ? rows.slice(0, limite) : rows
  const titulos: FinanceiroTituloListaRow[] = sliced.map((t) => {
    const cn = t.clientes as { nome?: string } | { nome?: string }[] | null
    const nomeCliente = Array.isArray(cn) ? cn[0]?.nome : cn?.nome
    return {
      id: t.id as string,
      valor_total: Number(t.valor_total),
      valor_aberto: Number(t.valor_aberto),
      status: String(t.status),
      descricao: t.descricao != null ? String(t.descricao) : null,
      vencimento: t.vencimento != null ? String(t.vencimento) : null,
      cliente_id: t.cliente_id as string,
      cliente_nome: nomeCliente ?? null,
    }
  })
  return { titulos, capped, error: null }
}

export const FIN_KPI_SOMA_CAP = 8000

const KPI_SUM_CAP = FIN_KPI_SOMA_CAP

/**
 * KPIs globais (não dependem dos filtros da tabela).
 * `error` distingue "sem títulos em aberto" (0 real) de falha na consulta —
 * mostrar R$ 0,00 por falha silenciosa é enganoso numa tela financeira.
 */
export async function fetchFinanceiroTitulosKpis(supabase: SupabaseClient): Promise<{
  titulosAbertosCount: number
  valorAbertoTotal: number
  kpiValorTruncado: boolean
  error: string | null
}> {
  const { count, error: eCount } = await supabase
    .from('contas_receber')
    .select('*', { count: 'exact', head: true })
    .in('status', ['ABERTO', 'PARCIAL'])
  if (eCount) {
    return {
      titulosAbertosCount: 0,
      valorAbertoTotal: 0,
      kpiValorTruncado: false,
      error: mensagemErroComSecao('Financeiro', eCount.message),
    }
  }

  const { data: vals, error: eVals } = await supabase
    .from('contas_receber')
    .select('valor_aberto')
    .in('status', ['ABERTO', 'PARCIAL'])
    .limit(KPI_SUM_CAP + 1)
  if (eVals) {
    return {
      titulosAbertosCount: 0,
      valorAbertoTotal: 0,
      kpiValorTruncado: false,
      error: mensagemErroComSecao('Financeiro', eVals.message),
    }
  }

  const rows = vals ?? []
  const kpiValorTruncado = rows.length > KPI_SUM_CAP
  const slice = kpiValorTruncado ? rows.slice(0, KPI_SUM_CAP) : rows
  const valorAbertoTotal = slice.reduce((s, r) => s + Number(r.valor_aberto ?? 0), 0)
  return {
    titulosAbertosCount: count ?? 0,
    valorAbertoTotal,
    kpiValorTruncado,
    error: null,
  }
}
