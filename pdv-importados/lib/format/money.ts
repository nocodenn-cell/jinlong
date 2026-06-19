/**
 * Coerção defensiva para formatação monetária/numérica.
 *
 * O PDV nunca deve renderizar "NaN", "R$ NaN" ou quebrar a tela quando um total
 * chega como `null`, `undefined`, `NaN` ou `Infinity` (ex.: estado parcial
 * durante rehidratação, RPC que ainda não respondeu, divisão por zero numa
 * regra de preço). Tratamos qualquer valor não-finito como `0` — um total
 * inconsistente nunca pode virar crash nem string enganosa.
 */
function toFiniteNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function formatBRL(value: number, locale = 'pt-BR'): string {
  return toFiniteNumber(value).toLocaleString(locale, {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatDecimal2(value: number, locale = 'pt-BR'): string {
  return toFiniteNumber(value).toLocaleString(locale, { minimumFractionDigits: 2 })
}

/** Número com separador de milhar conforme locale (contadores, métricas). */
export function formatNumberLocale(value: number, locale = 'pt-BR'): string {
  return toFiniteNumber(value).toLocaleString(locale)
}

/** Quantidade com casas decimais fixas (ex.: estoque 3 casas). */
export function formatDecimalPlaces(value: number, fractionDigits: number): string {
  return toFiniteNumber(value).toFixed(fractionDigits)
}
