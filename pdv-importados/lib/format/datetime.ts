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
 */
export function formatDateTimeLocaleDefault(
  value: string | Date | null | undefined,
  locale: string,
): string {
  if (value == null || value === '') return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(locale)
}

/** Dia/mês para eixos de gráfico (ex.: admin dashboard). */
export function formatDayMonthInLocale(date: Date, locale: string): string {
  // Guarda defensiva: eixos de gráfico nunca devem exibir "Invalid Date".
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
}
