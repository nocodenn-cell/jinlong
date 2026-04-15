export function formatBRL(value: number, locale = 'pt-BR'): string {
  return value.toLocaleString(locale, {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatDecimal2(value: number, locale = 'pt-BR'): string {
  return value.toLocaleString(locale, { minimumFractionDigits: 2 })
}
