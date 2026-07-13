/** Alinha quantidade no PDV com `numeric(10,3)` do Postgres (balança). */
export const QUANTIDADE_CAIXA_DECIMAL_PLACES = 3
export const QUANTIDADE_CAIXA_MIN = 0.001

export function roundQuantidadeCaixa3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000
}

/**
 * Normaliza quantidade do carrinho (0 = remover linha).
 * Aceita até 3 casas; valores abaixo de 0,001 viram 0.
 */
export function parseQuantidadeCaixaInput(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0
  const r = roundQuantidadeCaixa3(raw)
  return r < QUANTIDADE_CAIXA_MIN ? 0 : r
}

/** Parse de input do operador (vírgula ou ponto). */
export function parseQuantidadeCaixaFromString(raw: string): number {
  const normalizado = raw.replace(',', '.').trim()
  if (normalizado === '' || normalizado === '.' || normalizado === ',') return 0
  return parseQuantidadeCaixaInput(Number(normalizado))
}

export function quantidadeCaixaTemAte3Casas(n: number): boolean {
  if (!Number.isFinite(n) || n <= 0) return false
  const r = roundQuantidadeCaixa3(n)
  return Math.abs(n - r) < 1e-9
}

/**
 * Quantidade enviada a `calcular_preco_produto` (param integer).
 * Faixas de atacado usam piso; qtd fracionada em (0,1) mapeia para 1
 * (mesmo preço unitário varejo / faixa mínima), sem rejeitar a linha.
 */
export function quantidadeParaRpcPreco(q: number): number {
  const n = Number(q)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.max(1, Math.floor(n))
}
