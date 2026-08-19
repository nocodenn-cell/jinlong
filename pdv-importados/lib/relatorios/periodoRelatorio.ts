/**
 * Período dos relatórios: datas YYYY-MM-DD são dias civis no fuso passado (via `getRelatorioTimezone` + RPC).
 */

export const RELATORIO_TZ_PADRAO = 'America/Sao_Paulo'

export const RELATORIO_MAX_DIAS_INCLUSIVOS = 366

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function isYmd(s: string): boolean {
  if (!YMD.test(s)) return false
  const [y, mo, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, mo - 1, d))
  return (
    t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
  )
}

/** Data civil (YYYY-MM-DD) de um instante, no fuso informado. */
export function ymdEmFuso(instante: Date, timeZone: string = RELATORIO_TZ_PADRAO): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante)
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

/** Hoje (data civil) no fuso do relatório. */
export function ymdHojeNoFusoRelatorio(timeZone = RELATORIO_TZ_PADRAO): string {
  return ymdEmFuso(new Date(), timeZone)
}

/** Offset (minutos, local menos UTC) do fuso `timeZone` no instante dado. */
function offsetMinutosEm(instante: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const comoUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  )
  return (comoUtc - instante.getTime()) / 60_000
}

/**
 * Início do dia civil (00:00:00) de `ymd` no fuso informado, como instante UTC.
 * Ex.: `inicioDoDiaCivilEmUtc('2026-04-07', 'America/Sao_Paulo')` → `2026-04-07T03:00:00.000Z`.
 */
export function inicioDoDiaCivilEmUtc(ymd: string, timeZone: string = RELATORIO_TZ_PADRAO): Date {
  const [y, mo, d] = ymd.split('-').map(Number)
  const palpite = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0))
  const offsetMin = offsetMinutosEm(palpite, timeZone)
  return new Date(palpite.getTime() - offsetMin * 60_000)
}

/** Subtrai N dias do calendário gregoriano (independente de DST). */
export function subtrairDiasCivis(ymd: string, dias: number): string {
  const [y, mo, da] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, mo - 1, da - dias))
  const yy = t.getUTCFullYear()
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(t.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function defaultUltimosDiasNoFuso(quantidadeDias: number, timeZone = RELATORIO_TZ_PADRAO): {
  de: string
  ate: string
} {
  const ate = ymdHojeNoFusoRelatorio(timeZone)
  const de = subtrairDiasCivis(ate, quantidadeDias - 1)
  return { de, ate }
}

export function diasNoIntervaloInclusive(de: string, ate: string): number {
  const [y1, m1, d1] = de.split('-').map(Number)
  const [y2, m2, d2] = ate.split('-').map(Number)
  const a = Date.UTC(y1, m1 - 1, d1)
  const b = Date.UTC(y2, m2 - 1, d2)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.floor((b - a) / 86_400_000) + 1
}

export type PeriodoRelatorioResolvido = {
  de: string
  ate: string
  aviso: 'nenhum' | 'datas_invalidas' | 'periodo_invertido' | 'periodo_limitado'
}

/**
 * Normaliza query string: padrão últimos 30 dias civis no `timeZone`; inversão; teto de 366 dias.
 */
export function resolverPeriodoRelatorio(
  deRaw?: string,
  ateRaw?: string,
  timeZone: string = RELATORIO_TZ_PADRAO,
): PeriodoRelatorioResolvido {
  const padrao = defaultUltimosDiasNoFuso(30, timeZone)
  let de = (deRaw && isYmd(deRaw) ? deRaw : null) ?? padrao.de
  let ate = (ateRaw && isYmd(ateRaw) ? ateRaw : null) ?? padrao.ate

  let aviso: PeriodoRelatorioResolvido['aviso'] = 'nenhum'
  if (deRaw && !isYmd(deRaw)) aviso = 'datas_invalidas'
  if (ateRaw && !isYmd(ateRaw)) aviso = 'datas_invalidas'

  if (de > ate) {
    ;[de, ate] = [ate, de]
    aviso = 'periodo_invertido'
  }

  const dias = diasNoIntervaloInclusive(de, ate)
  if (dias > RELATORIO_MAX_DIAS_INCLUSIVOS) {
    de = subtrairDiasCivis(ate, RELATORIO_MAX_DIAS_INCLUSIVOS - 1)
    aviso = 'periodo_limitado'
  }

  return { de, ate, aviso }
}

/**
 * Formata YYYY-MM-DD (dia civil do relatório) para exibição sem depender do fuso do servidor Node.
 */
export function formatarDiaRelatorioParaLocale(ymd: string, locale: string): string {
  const s = String(ymd).slice(0, 10)
  if (!YMD.test(s)) return '—'
  const [y, mo, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  })
}
