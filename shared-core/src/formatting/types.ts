import type { AppLocale } from '../locale'

/** Moeda padrão do produto (piloto BR) até multi-currency. */
export type CurrencyCode = 'BRL' | 'USD' | 'CNY'

export const DEFAULT_CURRENCY: CurrencyCode = 'BRL'

export type FormatMoneyOptions = {
  locale: AppLocale
  /** Default: BRL */
  currency?: CurrencyCode
}

export type FormatNumberOptions = {
  locale: AppLocale
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

export type FormatDateTimeOptions = {
  locale: AppLocale
  /** IANA; se omitido, usa default do runtime / ambiente. */
  timeZone?: string
  dateStyle?: 'full' | 'long' | 'medium' | 'short'
  timeStyle?: 'full' | 'long' | 'medium' | 'short'
}
