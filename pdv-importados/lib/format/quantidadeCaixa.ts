/** Alinha quantidade no caixa web com `numeric(10,3)` do Postgres (balança). */
export const QUANTIDADE_CAIXA_DECIMAL_PLACES = 3

export function roundQuantidadeCaixa3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000
}

/** Normaliza input numérico do carrinho (mín. 0,001 para manter linha). */
export function parseQuantidadeCaixaInput(raw: number): number {
  if (!Number.isFinite(raw)) return 0
  return roundQuantidadeCaixa3(raw)
}

export function quantidadeCaixaTemAte3Casas(n: number): boolean {
  if (!Number.isFinite(n) || n <= 0) return false
  const r = roundQuantidadeCaixa3(n)
  return Math.abs(n - r) < 1e-9
}
