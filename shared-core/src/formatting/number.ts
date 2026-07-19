import type { FormatNumberOptions } from './types'

function toFinite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/** Formata número com locale BCP 47 (Intl). */
export function formatNumber(value: number, options: FormatNumberOptions): string {
  const {
    locale,
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options
  return toFinite(value).toLocaleString(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  })
}
