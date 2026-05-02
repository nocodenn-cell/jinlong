export function roundMoney2(value: number): number {
  return Math.round(value * 100) / 100
}

export function calcularTotais(itens: Array<{ precoOriginal: number; precoUnitario: number; quantidade: number }>) {
  const totalBruto = itens.reduce((acc, item) => acc + item.precoOriginal * item.quantidade, 0)
  const totalLiquido = itens.reduce((acc, item) => acc + item.precoUnitario * item.quantidade, 0)
  return {
    totalBruto: roundMoney2(totalBruto),
    totalLiquido: roundMoney2(totalLiquido),
    totalItens: itens.length,
    totalUnidades: itens.reduce((acc, item) => acc + item.quantidade, 0),
  }
}

export function calcularTotaisComGerente(
  itens: Array<{ precoOriginal: number; precoUnitario: number; quantidade: number }>,
  descontoPercentual: number
) {
  const { totalBruto, totalLiquido, totalItens, totalUnidades } = calcularTotais(itens)
  const descontoValor = (totalBruto * descontoPercentual) / 100
  return {
    totalBruto,
    totalLiquido: totalLiquido - descontoValor,
    totalItens,
    totalUnidades,
    descontoValor,
  }
}
