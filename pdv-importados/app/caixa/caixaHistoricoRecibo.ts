import type { HistoricoVendaDetalhe } from '@/app/caixa/actions'
import type { ReciboVenda } from '@/app/caixa/CaixaReciboModal'
import type { FinalizarVendaInput } from '@/app/caixa/finalizarVendaValidation'

/**
 * F1-05: a forma de pagamento gravada na venda é o que veio do cadastro da
 * loja, não mais um dos 4 valores fixos — não há como "validar" aqui sem
 * consultar o banco de novo, e reprint de recibo é leitura, não escrita.
 * Antes isso coagia qualquer valor desconhecido para 'DINHEIRO', o que
 * reimprimia o recibo com a forma errada. Agora só normaliza maiúsculas.
 */
function asFormaPagamento(valor: string): FinalizarVendaInput['formaPagamento'] {
  const up = valor.trim().toUpperCase()
  return up.length > 0 ? up : 'DINHEIRO'
}

/** Monta ReciboVenda a partir do detalhe do histórico (reimpressão). */
export function historicoDetalheParaRecibo(
  detalhe: HistoricoVendaDetalhe,
  moeda: string,
): ReciboVenda {
  const data = detalhe.data ? new Date(detalhe.data) : new Date()
  return {
    vendaId: detalhe.id,
    data: Number.isNaN(data.getTime()) ? new Date() : data,
    itens: detalhe.itens.map((i) => ({
      nome: i.nome,
      quantidade: i.quantidade,
      precoUnitario: i.precoUnitario,
      precoOriginal: i.precoUnitario,
      tipoPreco: 'VAREJO',
    })),
    pagamentos: detalhe.pagamentos.map((p) => ({
      formaPagamento: asFormaPagamento(p.formaPagamento),
      valor: p.valor,
    })),
    totalBruto: detalhe.totalBruto,
    totalDesconto: detalhe.totalDesconto,
    totalLiquidoComGerente: detalhe.totalLiquido,
    descontoGerentePercentual: 0,
    valorDescontoGerente: 0,
    moeda,
  }
}
