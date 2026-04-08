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

