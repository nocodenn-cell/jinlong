export type DashboardPeriod = 'TODAY' | '7D' | '30D'
export type DashboardStatus = 'ALL' | 'CONCLUIDA' | 'CANCELADA'

export function normalizePeriod(raw?: string): DashboardPeriod {
  if (raw === 'TODAY') return 'TODAY'
  if (raw === '30D') return '30D'
  return '7D'
}

export function normalizeStatus(raw?: string): DashboardStatus {
  if (raw === 'CONCLUIDA') return 'CONCLUIDA'
  if (raw === 'CANCELADA') return 'CANCELADA'
  return 'ALL'
}

export function getPeriodRange(period: DashboardPeriod, now = new Date()) {
  const end = new Date(now)
  const start = new Date(now)

  if (period === 'TODAY') {
    start.setHours(0, 0, 0, 0)
  } else if (period === '30D') {
    start.setDate(start.getDate() - 29)
    start.setHours(0, 0, 0, 0)
  } else {
    start.setDate(start.getDate() - 6)
    start.setHours(0, 0, 0, 0)
  }

  const previousEnd = new Date(start)
  const previousStart = new Date(start)
  const diff = end.getTime() - start.getTime()
  previousStart.setTime(previousStart.getTime() - diff)

  return { start, end, previousStart, previousEnd }
}

/**
 * Drill-down dos KPIs de venda → `/admin/vendas` no MESMO recorte.
 *
 * Só `TODAY` tem equivalente **exato**: os dois lados usam meia-noite de hoje
 * como início (`getPeriodRange` aqui, `periodoInicio('hoje')` lá).
 *
 * `7D` e `30D` devolvem `null` de propósito — as duas telas calculam janelas
 * diferentes, e linkar levaria o operador a um conjunto que não bate com o
 * número que ele clicou:
 *
 * | Período | Dashboard                    | Vendas                        |
 * |---------|------------------------------|-------------------------------|
 * | 7 dias  | `hoje−6` às 00:00 (7 dias)   | `agora−168h` (janela móvel)   |
 * | 30 dias | `hoje−29` às 00:00 (30 dias) | não existe — só `mes` (dia 1) |
 *
 * Fechar isso exige uma fonte única de período entre as duas telas, não um
 * `case` a mais aqui — ver backlog em `docs/AUDITORIA_POS_ONDA_2.md`.
 *
 * Mora neste módulo (e não na página) porque `page.tsx` do App Router só aceita
 * os exports do contrato de rota — export nomeado ali quebra o `next build`.
 */
export function periodoVendasEquivalente(period: DashboardPeriod): string | null {
  return period === 'TODAY' ? 'hoje' : null
}

export function formatTrendPercent(current: number, previous: number) {
  if (previous <= 0) {
    return {
      up: current >= 0,
      label: current > 0 ? '+100%' : '0%',
    }
  }
  const pct = ((current - previous) / previous) * 100
  const rounded = Math.abs(Math.round(pct * 10) / 10).toFixed(1)
  return {
    up: pct >= 0,
    label: `${pct >= 0 ? '+' : '-'}${rounded}%`,
  }
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

