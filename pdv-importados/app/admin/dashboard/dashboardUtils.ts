import {
  RELATORIO_TZ_PADRAO,
  horaEmFuso,
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

/** Dia civil (YYYY-MM-DD) no fuso da loja. Antes: `toISOString()`, que agrupava em UTC (23:30 BRT caía no dia seguinte). */
export function dateKey(date: Date, timeZone: string = RELATORIO_TZ_PADRAO) {
  return ymdEmFuso(date, timeZone)
}

/** Dias civis (YYYY-MM-DD) de `start` a `end` inclusive, no fuso da loja. */
export function diasCivisDoPeriodo(
  start: Date,
  end: Date,
  timeZone: string = RELATORIO_TZ_PADRAO,
): string[] {
  const dias: string[] = []
  const ultimo = ymdEmFuso(end, timeZone)
  let atual = ymdEmFuso(start, timeZone)
  // trava de segurança: período máximo do dashboard é 30 dias
  for (let i = 0; i < 400 && atual <= ultimo; i++) {
    dias.push(atual)
    atual = subtrairDiasCivis(atual, -1)
  }
  return dias
}

type VendaTempo = { data: string; total_liquido: number | string | null }

/** Soma e contagem por dia civil do fuso da loja. */
export function agruparVendasPorDia(
  rows: ReadonlyArray<VendaTempo>,
  timeZone: string = RELATORIO_TZ_PADRAO,
): { total: Map<string, number>; pedidos: Map<string, number> } {
  const total = new Map<string, number>()
  const pedidos = new Map<string, number>()
  for (const row of rows) {
    const key = dateKey(new Date(row.data), timeZone)
    total.set(key, (total.get(key) ?? 0) + Number(row.total_liquido ?? 0))
    pedidos.set(key, (pedidos.get(key) ?? 0) + 1)
  }
  return { total, pedidos }
}

/** Soma por hora cheia (0–23) NO FUSO DA LOJA — não a hora do processo Node (UTC em produção). */
export function agruparVendasPorHora(
  rows: ReadonlyArray<VendaTempo>,
  timeZone: string = RELATORIO_TZ_PADRAO,
): number[] {
  const horas = new Array<number>(24).fill(0)
  for (const row of rows) {
    const h = horaEmFuso(new Date(row.data), timeZone)
    horas[h] = (horas[h] ?? 0) + Number(row.total_liquido ?? 0)
  }
  return horas
}

/** Prefixo curto de UUID/id para tabela; valor completo fica no title. */
export function shortOrderId(id: string, keep = 8): string {
  const trimmed = id.trim()
  if (trimmed.length <= keep) return trimmed
  return `${trimmed.slice(0, keep)}…`
}
