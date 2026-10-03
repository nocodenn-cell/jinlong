/**
 * Filtros do histórico de caixas — funções puras (fora de `'use server'`).
 * Período: mesma janela (fuso BRT) de `/admin/vendas` e da Auditoria — `lib/admin/periodo.ts` —
 * aplicada sobre `caixas.data_fechamento`.
 */

import { periodoFim as periodoFimBrt, periodoInicio as periodoInicioBrt, type Periodo } from '@/lib/admin/periodo'

export type CaixasPeriodo = Periodo
export type CaixasStatusFiltro = 'all' | 'divergencia' | 'retomado'

export const CAIXAS_PERIODOS: readonly CaixasPeriodo[] = ['tudo', 'hoje', 'ontem', '7d', '30d', 'mes']
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

export function periodoInicio(periodo: CaixasPeriodo, now: Date = new Date()): string | null {
  return periodoInicioBrt(periodo, now)
}

export function periodoFim(periodo: CaixasPeriodo, now: Date = new Date()): string | null {
  return periodoFimBrt(periodo, now)
}

/**
 * Rótulos do filtro de operador: nomes repetidos (ex.: dois "Operador E2E") ganham o início do id
 * para o gerente conseguir distinguir; nomes únicos ficam como estão.
 */
export function rotulosOperadores(
  operadores: ReadonlyArray<{ id: string; nome: string }>,
): Array<{ value: string; label: string }> {
  const contagem = new Map<string, number>()
  for (const o of operadores) {
    const k = o.nome.trim().toLowerCase()
    contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }
  return operadores.map((o) => ({
    value: o.id,
    label: (contagem.get(o.nome.trim().toLowerCase()) ?? 0) > 1 ? `${o.nome} (${o.id.slice(0, 4)})` : o.nome,
  }))
}
