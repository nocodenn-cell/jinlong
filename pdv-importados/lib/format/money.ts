export function formatBRL(value: number, locale = 'pt-BR'): string {
  return value.toLocaleString(locale, {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatDecimal2(value: number, locale = 'pt-BR'): string {
  return value.toLocaleString(locale, { minimumFractionDigits: 2 })
}

/** Número com separador de milhar conforme locale (contadores, métricas). */
export function formatNumberLocale(value: number, locale = 'pt-BR'): string {
  return value.toLocaleString(locale)
}

/** Quantidade com casas decimais fixas (ex.: estoque 3 casas). */
export function formatDecimalPlaces(value: number, fractionDigits: number): string {
  return Number(value).toFixed(fractionDigits)
}
