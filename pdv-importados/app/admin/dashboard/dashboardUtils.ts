import {
  RELATORIO_TZ_PADRAO,
  inicioDoDiaCivilEmUtc,
  subtrairDiasCivis,
  ymdEmFuso,
} from '@/lib/relatorios/periodoRelatorio'

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

/**
 * `start` é o início do dia civil (não a hora local do processo Node, que em
 * produção roda em UTC) — sem isso, KPIs de "hoje" ficam deslocados em até 3h
 * ao redor da meia-noite em `timeZone`. `end` já é um instante absoluto (`now`),
 * correto independente de fuso.
 */
export function getPeriodRange(
  period: DashboardPeriod,
  timeZone: string = RELATORIO_TZ_PADRAO,
  now = new Date(),
) {
  const end = new Date(now)
  const hojeYmd = ymdEmFuso(now, timeZone)
  const diasAtras = period === 'TODAY' ? 0 : period === '30D' ? 29 : 6
  const deYmd = subtrairDiasCivis(hojeYmd, diasAtras)
  const start = inicioDoDiaCivilEmUtc(deYmd, timeZone)

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
