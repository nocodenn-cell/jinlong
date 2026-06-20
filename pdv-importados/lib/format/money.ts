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
 * Formata número como decimal BRL sem símbolo de moeda (ex.: 25.9 → "25,90").
 * Sempre pt-BR. Ideal para inputs e células de tabela editáveis.
 */
export function formatDecimalBRL(value: number): string {
  return toFiniteNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Filtra input do usuário para aceitar apenas dígitos e vírgula decimal BRL.
 * Bloqueia pontos (separador de milhar não digitado), limita a 1 vírgula e 2 casas decimais.
 * Usado em inputs de preço para impedir "25.9" aparecer no estado de digitação.
 */
export function filterBRLChars(raw: string): string {
  let v = raw.replace(/[^\d,]/g, '')
  const parts = v.split(',')
  if (parts.length > 2) {
    v = parts[0] + ',' + parts.slice(1).join('')
  }
  if (parts.length === 2 && parts[1].length > 2) {
    v = parts[0] + ',' + parts[1].slice(0, 2)
  }
  return v
}

/**
 * Converte string BRL (ex.: "25,90" ou "1.234,56") em número.
 * Retorna null se a string for inválida ou vazia.
 */
export function parseBRL(raw: string): number | null {
  const t = raw.trim().replace(/\./g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
