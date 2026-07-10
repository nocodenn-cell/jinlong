import type { HistoricoVendaDetalhe } from '@/app/caixa/actions'
import type { ReciboVenda } from '@/app/caixa/CaixaReciboModal'
import type { FinalizarVendaInput } from '@/app/caixa/finalizarVendaValidation'

const FORMAS_VALIDAS = new Set<FinalizarVendaInput['formaPagamento']>([
  'DINHEIRO',
  'PIX',
  'CARTAO_DEBITO',
  'CARTAO_CREDITO',
])

function asFormaPagamento(valor: string): FinalizarVendaInput['formaPagamento'] {
  const up = valor.toUpperCase()
  return FORMAS_VALIDAS.has(up as FinalizarVendaInput['formaPagamento'])
    ? (up as FinalizarVendaInput['formaPagamento'])
    : 'DINHEIRO'
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
