import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'

export type ItemAutoritativo = {
  produtoId: string
  quantidade: number
  precoOriginal: number
  precoUnitario: number
  descontoUnitario: number
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'
}

export type ItemEntradaFinalizacao = {
  produtoId: string
  quantidade: number
  precoOriginal: number
  precoUnitario: number
  tipoPreco: ItemAutoritativo['tipoPreco']
}

/**
 * Transporte puro (sem decisão de negócio): normaliza os itens do carrinho para
 * o formato persistido, arredondando valores monetários a 2 casas.
 *
 * NENHUMA regra financeira vive aqui. Toda autoridade de preço, EPS, âncora de
 * catálogo, vendabilidade e limite de sobrecarga é do PostgreSQL
 * (finalizar_venda_transacional_canonica_v3, migrations 235/236), executada
 * dentro da transação e impossível de burlar via chamada direta ao RPC.
 *
 * `descontoUnitario` é aritmética derivada (precoOriginal − precoUnitario), não
 * uma decisão de aceitação. O servidor SQL revalida tudo antes de persistir.
 */
export function recalcularItensNoServidor(
  itensInput: ItemEntradaFinalizacao[],
): ItemAutoritativo[] {
  return itensInput.map((i) => {
    const precoOriginal = roundMoney2(i.precoOriginal)
    const precoUnitario = roundMoney2(i.precoUnitario)
    return {
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      precoOriginal,
      precoUnitario,
      descontoUnitario: roundMoney2(precoOriginal - precoUnitario),
      tipoPreco: i.tipoPreco,
    }
  })
}
