/**
 * Cálculo de totais do carrinho — domínio puro, reutilizado no painel Next e no PDV Tauri.
 */
import { roundAbnt } from '../money/roundAbnt'

/** Duas casas decimais — espelha `public.round_abnt(n, 2)` no Postgres. */
export function roundMoney2(n: number): number {
  return roundAbnt(n, 2)
}

export interface ItemParaTotalizacao {
  resultado: { precoOriginal: number; precoUnitario: number }
  quantidade: number
}

export interface TotaisBase {
  totalBruto: number
  totalLiquidoBase: number
  totalItens: number
  totalUnidades: number
}

export interface TotaisCarrinho {
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  totalItens: number
  totalUnidades: number
}

export interface TotaisComGerente extends TotaisCarrinho {
  descontoGerenteValor: number
}

export function calcularTotaisBase(itens: ItemParaTotalizacao[]): TotaisBase {
  const totalBruto = itens.reduce(
    (acc, item) => acc + item.resultado.precoOriginal * item.quantidade,
    0
  )
  const totalLiquidoBase = itens.reduce(
    (acc, item) => acc + item.resultado.precoUnitario * item.quantidade,
    0
  )
  return {
    totalBruto,
    totalLiquidoBase,
    totalItens: itens.length,
    totalUnidades: itens.reduce((acc, item) => acc + item.quantidade, 0),
  }
}

export function calcularTotais(itens: ItemParaTotalizacao[]): TotaisCarrinho {
  const base = calcularTotaisBase(itens)
  const totalDesconto = base.totalBruto - base.totalLiquidoBase
  return {
    totalBruto: roundMoney2(base.totalBruto),
    totalDesconto: roundMoney2(totalDesconto),
    totalLiquido: roundMoney2(base.totalLiquidoBase),
    totalItens: base.totalItens,
    totalUnidades: base.totalUnidades,
  }
}

export function calcularTotaisComGerente(
  itens: ItemParaTotalizacao[],
  descontoGerentePercentual: number
): TotaisComGerente {
  const base = calcularTotaisBase(itens)
  const descontoGerenteValor =
    descontoGerentePercentual > 0
      ? (base.totalLiquidoBase * descontoGerentePercentual) / 100
      : 0
  const totalLiquido = base.totalLiquidoBase - descontoGerenteValor
  const totalDesconto = base.totalBruto - totalLiquido

  return {
    totalBruto: roundMoney2(base.totalBruto),
    totalDesconto: roundMoney2(totalDesconto),
    totalLiquido: roundMoney2(totalLiquido),
    totalItens: base.totalItens,
    totalUnidades: base.totalUnidades,
    descontoGerenteValor: roundMoney2(descontoGerenteValor),
  }
}
