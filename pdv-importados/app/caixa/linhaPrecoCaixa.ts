import { roundMoney2 } from '@/shared/cart/totals'

/** Há desconto de tabela (atacado ou manual) em relação ao preço de referência. */
export function exibeDescontoTabela(precoOriginal: number, precoUnitario: number): boolean {
  return roundMoney2(precoOriginal - precoUnitario) > 0
}

/** Subtotal da linha no mesmo arredondamento da finalização (round_abnt / 2 casas). */
export function subtotalLinhaCaixa(precoUnitario: number, quantidade: number): number {
  return roundMoney2(precoUnitario * quantidade)
}

/** Economia da linha (referência − efetivo) × quantidade, já arredondada. */
export function descontoLinhaCaixa(
  precoOriginal: number,
  precoUnitario: number,
  quantidade: number,
): number {
  if (!exibeDescontoTabela(precoOriginal, precoUnitario)) return 0
  return roundMoney2(roundMoney2(precoOriginal - precoUnitario) * quantidade)
}
