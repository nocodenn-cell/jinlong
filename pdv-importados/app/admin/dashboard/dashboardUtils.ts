export type DashboardPeriod = 'TODAY' | '7D' | '30D'
export type DashboardStatus = 'ALL' | 'CONCLUIDA' | 'CANCELADA'

/** Default alinhado ao FilterBar do dashboard (`defaultValue: 'TODAY'`). */
export function normalizePeriod(raw?: string): DashboardPeriod {
  if (raw === '7D') return '7D'
  if (raw === '30D') return '30D'
  if (raw === 'TODAY') return 'TODAY'
  return 'TODAY'
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

export type TrendPercent = {
  up: boolean
  label: string
  /** Sem baseline anterior — não tratar como alta/baixa. */
  neutral?: boolean
}

type TrendLabels = {
  newLabel: string
  flatLabel: string
}

/**
 * Variação percentual. Sem período anterior comparável: "novo" ou flat (—),
 * nunca +100% artificial.
 */
export function formatTrendPercent(
  current: number,
  previous: number,
  labels?: TrendLabels,
): TrendPercent {
  if (previous <= 0) {
    if (current > 0) {
      return { up: true, label: labels?.newLabel ?? 'novo', neutral: true }
    }
    return { up: true, label: labels?.flatLabel ?? '0%', neutral: true }
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

/** Prefixo curto de UUID/id para tabela; valor completo fica no title. */
export function shortOrderId(id: string, keep = 8): string {
  const trimmed = id.trim()
  if (trimmed.length <= keep) return trimmed
  return `${trimmed.slice(0, keep)}…`
}
