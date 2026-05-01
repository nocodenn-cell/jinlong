/**
 * Cálculos de totais compartilhados para carrinho
 */

import type { ItemCarrinhoComPreco } from '../../pdv-importados/stores/unifiedCartStore'

export function roundMoney2(value: number): number {
  return Math.round(value * 100) / 100
}

export function calcularTotaisComGerente(
  itens: ItemCarrinhoComPreco[],
  descontoGerentePercentual: number
) {
  const { totalBruto, totalLiquido, totalItens, totalUnidades } = calcularTotais(itens)
  
  const descontoGerenteValor = roundMoney2((totalBruto * descontoGerentePercentual) / 100)
  const totalComDescontoGerente = roundMoney2(totalLiquido - descontoGerenteValor)
  const totalDesconto = roundMoney2(totalBruto - totalComDescontoGerente)

  return {
    totalBruto,
    totalDesconto,
    totalLiquido: totalComDescontoGerente,
    totalItens,
    totalUnidades,
    descontoGerenteValor,
  }
}

function calcularTotais(itens: ItemCarrinhoComPreco[]) {
  const totalBruto = itens.reduce(
    (acc, item) => acc + item.resultado.precoOriginal * item.quantidade,
    0
  )
  const totalLiquido = itens.reduce(
    (acc, item) => acc + item.resultado.precoUnitario * item.quantidade,
    0
  )

  return {
    totalBruto: roundMoney2(totalBruto),
    totalLiquido: roundMoney2(totalLiquido),
    totalItens: itens.length,
    totalUnidades: itens.reduce((acc, item) => acc + item.quantidade, 0),
  }
}
