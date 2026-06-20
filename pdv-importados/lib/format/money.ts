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

/**
 * Converte uma string monetária digitada pelo usuário em `number`.
 *
 * Fonte única de verdade para parsing de moeda — não duplicar
 * `parseFloat(x.replace(',', '.'))` em telas, pois isso quebra com separador
 * de milhar: `"1.234,56".replace(',', '.')` vira `"1.234.56"` e
 * `parseFloat` para no segundo ponto, devolvendo `1.234` em vez de `1234.56`.
 *
 * Heurística determinística: o separador (`,` ou `.`) que aparece **por
 * último** é o decimal; o outro é separador de milhar e é removido. Cobre
 * tanto o padrão pt-BR (`1.234,56`) quanto o americano (`1,234.56` / `1234.56`).
 *
 * Retorna `NaN` para entrada vazia/inválida — o chamador decide o fallback
 * (geralmente validar com `Number.isFinite`).
 *
 *   parseMoney('1.234,56') // 1234.56
 *   parseMoney('9,99')     // 9.99
 *   parseMoney('9.99')     // 9.99
 *   parseMoney('')         // NaN
 */
export function parseMoney(raw: string): number {
  if (typeof raw !== 'string') return NaN
  // Mantém apenas dígitos, separadores e sinal; descarta "R$", espaços, etc.
  const cleaned = raw.trim().replace(/[^\d.,-]/g, '')
  if (cleaned === '' || cleaned === '-') return NaN

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  const decimalPos = Math.max(lastComma, lastDot)

  let normalized: string
  if (decimalPos === -1) {
    // Sem separador decimal: só dígitos (e possível sinal).
    normalized = cleaned
  } else {
    // Tudo antes da última ocorrência é parte inteira (milhares removidos);
    // tudo depois é a parte decimal.
    const intPart = cleaned.slice(0, decimalPos).replace(/[.,]/g, '')
    const fracPart = cleaned.slice(decimalPos + 1).replace(/[.,]/g, '')
    normalized = `${intPart}.${fracPart}`
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}
