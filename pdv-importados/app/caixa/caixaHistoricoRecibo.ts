import type { HistoricoVendaDetalhe } from '@/app/caixa/actions'
import { asFormaPagamento, type ReciboVenda } from '@/lib/caixa/reciboTypes'
import type { FinalizarVendaInput } from '@/app/caixa/finalizarVendaValidation'

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
