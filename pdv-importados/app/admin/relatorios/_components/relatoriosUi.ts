/**
 * Helpers de apresentação da tela Admin Relatórios.
 * Só formatação/ordenação visual — sem alterar contratos RPC.
 */

import { ticketMedio as ticketMedioCanonico } from '@/lib/vendas/metricasVendas'

export type AvisoPeriodo = 'nenhum' | 'datas_invalidas' | 'periodo_invertido' | 'periodo_limitado'

export type RelatoriosTabId = 'visao' | 'produtos' | 'estoque' | 'margem' | 'vendas'

export const RELATORIOS_TAB_IDS: RelatoriosTabId[] = [
  'visao',
  'produtos',
  'estoque',
  'margem',
  'vendas',
]

export const COBERTURA_DIAS_CAP = 365

export function parseRelatoriosTab(raw: string | null | undefined): RelatoriosTabId {
  if (raw === 'produtos' || raw === 'estoque' || raw === 'margem' || raw === 'vendas' || raw === 'visao') {
    return raw
  }
  return 'visao'
}

/** Omite aviso neutro; demais viram chave i18n. */
export function avisoPeriodoVisivel(aviso: AvisoPeriodo): Exclude<AvisoPeriodo, 'nenhum'> | null {
  return aviso === 'nenhum' ? null : aviso
}

export function sortPorDiaAsc<T extends { dia: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.dia.localeCompare(b.dia))
}

export function sumFaturamento(rows: Array<{ total_liquido: number }>): number {
  return rows.reduce((acc, row) => acc + Number(row.total_liquido ?? 0), 0)
}

/** Mesma fórmula canônica (`lib/vendas/metricasVendas`); aqui `null` só para exibir "—" sem vendas. */
export function ticketMedio(faturamento: number, vendasConcluidas: number): number | null {
  if (vendasConcluidas <= 0) return null
  return ticketMedioCanonico(faturamento, vendasConcluidas)
}

export function sortReposicaoPorDeficit<T extends { deficit: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(b.deficit) - Number(a.deficit))
}

export function sortCoberturaUrgente<T extends { diasCobertura: number | null }>(rows: T[]): T[] {
  return [...rows]
    .filter((row) => row.diasCobertura != null)
    .sort((a, b) => Number(a.diasCobertura) - Number(b.diasCobertura))
}

/** Apresentação: limita outliers extremos sem alterar o valor bruto. */
export function formatDiasCobertura(dias: number, labels: { dias: string; diasCap: string }): string {
  const rounded = Math.round(dias)
  if (rounded > COBERTURA_DIAS_CAP) {
    return labels.diasCap.replace('{{n}}', String(COBERTURA_DIAS_CAP))
  }
  return `~${rounded} ${labels.dias}`
}
