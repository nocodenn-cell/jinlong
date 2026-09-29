/**
 * Filtros do histórico de caixas — funções puras (fora de `'use server'`).
 * Mesma semântica de período de `/admin/vendas` (hoje/ontem/7d/mês/tudo),
 * aplicada sobre `caixas.data_fechamento`.
 */

export type CaixasPeriodo = 'tudo' | 'hoje' | 'ontem' | '7d' | 'mes'
export type CaixasStatusFiltro = 'all' | 'divergencia' | 'retomado'

export const CAIXAS_PERIODOS: readonly CaixasPeriodo[] = ['tudo', 'hoje', 'ontem', '7d', 'mes']
export const CAIXAS_STATUS: readonly CaixasStatusFiltro[] = ['all', 'divergencia', 'retomado']
export const CAIXAS_PERIODO_PADRAO: CaixasPeriodo = '7d'

export type CaixasFiltro = Readonly<{
  /** ISO inclusivo (`data_fechamento >= inicio`). */
  inicio: string | null
  /** ISO inclusivo (`data_fechamento <= fim`). */
  fim: string | null
  status: CaixasStatusFiltro
  operadorId: string | null
}>

export const CAIXAS_FILTRO_VAZIO: CaixasFiltro = { inicio: null, fim: null, status: 'all', operadorId: null }

export function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

export function clampPage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

const DIA_MS = 86_400_000

function inicioDoDia(base: Date, deslocamentoDias = 0): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + deslocamentoDias)
  d.setHours(0, 0, 0, 0)
  return d
}

export function periodoInicio(periodo: CaixasPeriodo, now: Date = new Date()): string | null {
  if (periodo === 'hoje') return inicioDoDia(now).toISOString()
  if (periodo === 'ontem') return inicioDoDia(now, -1).toISOString()
  if (periodo === '7d') return new Date(now.getTime() - 7 * DIA_MS).toISOString()
  if (periodo === 'mes') {
    const d = new Date(now)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  return null
}

export function periodoFim(periodo: CaixasPeriodo, now: Date = new Date()): string | null {
  if (periodo !== 'ontem') return null
  const d = inicioDoDia(now, -1)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}
