import type { FormatDateTimeOptions } from './types'

/**
 * Formata data/hora via Intl.
 * Retorna string vazia se inválido (borda pode mapear para "—").
 */
export function formatDateTime(
  value: Date | string | number,
  options: FormatDateTimeOptions,
): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''

  const {
    locale,
    timeZone,
    dateStyle = 'short',
    timeStyle = 'short',
  } = options

  return d.toLocaleString(locale, {
    dateStyle,
    timeStyle,
    ...(timeZone ? { timeZone } : {}),
  })
}

/** Só data (sem hora). */
export function formatDate(
  value: Date | string | number,
  options: Pick<FormatDateTimeOptions, 'locale' | 'timeZone' | 'dateStyle'>,
): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''

  return d.toLocaleDateString(options.locale, {
    dateStyle: options.dateStyle ?? 'short',
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  })
}
