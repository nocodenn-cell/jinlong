import { DEFAULT_CURRENCY, type FormatMoneyOptions } from './types'

function toFinite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/**
 * Formata valor monetário via Intl.
 * Currency default BRL (produto piloto BR) — independente do locale de UI.
 */
export function formatMoney(value: number, options: FormatMoneyOptions): string {
  const currency = options.currency ?? DEFAULT_CURRENCY
  return toFinite(value).toLocaleString(options.locale, {
    style: 'currency',
    currency,
  })
}
