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
 * Fonte única de verdade — não duplicar lógica de parsing em componentes.
 *
 * Regra pt-BR (compatível com Bling, Tiny, Omie, Conta Azul, TOTVS, etc.):
 *
 *   1. Vírgula presente → é o separador decimal; pontos são milhar (removidos).
 *      "1.234,56" → 1234.56   "1.000,00" → 1000   "9,99" → 9.99
 *
 *   2. Sem vírgula, ponto(s) agrupam exatamente 3 dígitos → ponto é milhar.
 *      "1.000" → 1000   "100.000" → 100000
 *      (todos os ERPs BR tratam ponto-de-três-dígitos como separador de milhar)
 *
 *   3. Sem vírgula, ponto não agrupando 3 dígitos → ponto é decimal.
 *      "1234.56" → 1234.56   "9.99" → 9.99   (interoperabilidade americana)
 *
 * Retorna `NaN` para entrada vazia/inválida — o chamador valida com
 * `Number.isFinite` e decide o fallback.
 *
 *   parseMoney('1.000')    // 1000
 *   parseMoney('1.234,56') // 1234.56
 *   parseMoney('9,99')     // 9.99
 *   parseMoney('1234.56')  // 1234.56
 *   parseMoney('')         // NaN
 */
export function parseMoney(raw: string): number {
  if (typeof raw !== 'string') return NaN
  // Remove símbolo de moeda, espaços e demais caracteres; mantém dígitos, . , e sinal.
  const cleaned = raw.trim().replace(/[^\d.,-]/g, '')
  if (cleaned === '' || cleaned === '-') return NaN

  let normalized: string

  if (cleaned.includes(',')) {
    // Regra 1: vírgula presente → decimal pt-BR; pontos são milhar.
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    // Regra 2: sem vírgula, mas ponto(s) com grupos fixos de 3 dígitos → milhar.
    normalized = cleaned.replace(/\./g, '')
  } else {
    // Regra 3: ponto como separador decimal (formato americano / sem milhar).
    normalized = cleaned
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}
