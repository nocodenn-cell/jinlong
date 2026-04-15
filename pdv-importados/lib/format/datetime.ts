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
