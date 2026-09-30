import type { HistoricoVendaDetalhe } from '@/app/caixa/actions'
import type { ReciboVenda } from '@/lib/caixa/reciboTypes'
import type { FinalizarVendaInput } from '@/app/caixa/finalizarVendaValidation'

const FORMAS_VALIDAS = new Set<FinalizarVendaInput['formaPagamento']>([
  'DINHEIRO',
  'PIX',
  'CARTAO_DEBITO',
  'CARTAO_CREDITO',
])

export function asFormaPagamento(valor: string): FinalizarVendaInput['formaPagamento'] {
  const up = valor.toUpperCase()
  return FORMAS_VALIDAS.has(up as FinalizarVendaInput['formaPagamento'])
    ? (up as FinalizarVendaInput['formaPagamento'])
    : 'DINHEIRO'
}

/** Separa desconto de itens do desconto gerente (vendas.total_desconto agrega ambos). */
export function totalDescontoItensHistorico(detalhe: HistoricoVendaDetalhe): number {
  const valorGerente = Math.max(0, detalhe.valorDescontoGerente ?? 0)
  return Math.max(0, detalhe.totalDesconto - valorGerente)
}

/** Monta ReciboVenda a partir do detalhe do histórico (reimpressão). */
export function historicoDetalheParaRecibo(
  detalhe: HistoricoVendaDetalhe,
  moeda: string,
): ReciboVenda {
  const data = detalhe.data ? new Date(detalhe.data) : new Date()
  const valorDescontoGerente = Math.max(0, detalhe.valorDescontoGerente ?? 0)
  const descontoGerentePercentual = Math.max(0, detalhe.descontoGerentePercentual ?? 0)
  return {
    vendaId: detalhe.id,
    data: Number.isNaN(data.getTime()) ? new Date() : data,
    clienteNome: detalhe.clienteNome,
    itens: detalhe.itens.map((i) => ({
      nome: i.nome,
      quantidade: i.quantidade,
      precoUnitario: i.precoUnitario,
      precoOriginal: i.precoOriginal ?? i.precoUnitario,
      tipoPreco: i.tipoPreco || 'VAREJO',
    })),
    pagamentos: detalhe.pagamentos.map((p) => ({
      formaPagamento: asFormaPagamento(p.formaPagamento),
      valor: p.valor,
    })),
    totalBruto: detalhe.totalBruto,
    // Mesma semântica do cupom emitido na hora: `totalDesconto` INCLUI o desconto do gerente
    // (o cupom separa "Desconto produtos" = totalDesconto − valorDescontoGerente).
    totalDesconto: detalhe.totalDesconto,
    totalLiquidoComGerente: detalhe.totalLiquido,
    descontoGerentePercentual,
    valorDescontoGerente,
    moeda,
  }
}
