/**
 * Rateio do desconto da venda entre os itens, em centavos — espelho exato de
 * `internal.comissao_ratear_centavos` (migration 20261021200000).
 * Maiores restos; empate vai para o menor índice. Determinístico.
 */
export function ratearCentavos(pesos: readonly number[], total: number): number[] {
  const n = pesos.length
  if (n === 0) return []
  const w = pesos.map((p) => Math.max(Math.round((Number.isFinite(p) ? p : 0) * 100), 0))
  const soma = w.reduce((a, b) => a + b, 0)
  let t = Math.round((Number.isFinite(total) ? total : 0) * 100)
  if (soma === 0 || t <= 0) return new Array<number>(n).fill(0)
  t = Math.min(t, soma)
  const parte = w.map((wi) => Math.floor((t * wi) / soma))
  const resto = w.map((wi) => (t * wi) % soma)
  let faltam = t - parte.reduce((a, b) => a + b, 0)
  const ordem = resto.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r || a.i - b.i)
  for (const { i } of ordem) {
    if (faltam <= 0) break
    parte[i] += 1
    faltam -= 1
  }
  return parte.map((c) => c / 100)
}

/** Comissão de um item sobre a base líquida (espelho de `internal.comissao_valor_item_liquido`). */
export function comissaoItemLiquido(input: {
  quantidade: number
  precoUnitario: number
  desconto: number
  tipo: 'percentual' | 'fixo'
  percentual?: number | null
  valorFixo?: number | null
}): number {
  const { quantidade, precoUnitario, desconto, tipo } = input
  if (!(quantidade > 0)) return 0
  if (tipo === 'fixo') return round2((input.valorFixo ?? 0) * quantidade)
  const base = Math.max(round2(quantidade * precoUnitario) - (desconto ?? 0), 0)
  return round2((base * (input.percentual ?? 0)) / 100)
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}
