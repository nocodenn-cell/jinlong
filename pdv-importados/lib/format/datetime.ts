/**
 * Formata data/hora para tabelas do painel gerencial (locale do usuário).
 * `timeStyle`: `short` — hora sem segundos; `medium` — inclui segundos quando o locale exibir.
 */
export function formatDateTimeOrDash(
  value: string | Date | null | undefined,
  locale: string,
  timeStyle: 'short' | 'medium' = 'short',
): string {
  if (value == null || value === '') return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(locale, { dateStyle: 'short', timeStyle })
}

/**
 * Equivalente a `Date#toLocaleString(locale)` sem opções, com o mesmo critério de “—” que `formatDateTimeOrDash`.
 * Em Server Components (Node em UTC) passe `timeZone` (fuso da loja); sem ele usa o fuso do processo.
 */
export function formatDateTimeLocaleDefault(
  value: string | Date | null | undefined,
  locale: string,
  timeZone?: string,
): string {
  if (value == null || value === '') return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return timeZone ? d.toLocaleString(locale, { timeZone }) : d.toLocaleString(locale)
}

/** Dia/mês para eixos de gráfico (ex.: admin dashboard). */
export function formatDayMonthInLocale(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
}
