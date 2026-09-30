/**
 * Monta o `ReciboVenda` (2ª via) a partir do detalhe de venda do admin.
 * Mesma semântica do cupom emitido no caixa: `totalDesconto` inclui o desconto do gerente.
 */
import type { VendaDetalhe } from "@/app/admin/vendas/actions"
import { asFormaPagamento, type ReciboVenda } from "@/lib/caixa/reciboTypes"

export function vendaAdminParaRecibo(venda: VendaDetalhe, moeda: string): ReciboVenda {
  const data = venda.data ? new Date(venda.data) : new Date()
  const pagamentos =
    venda.pagamentos.length > 0
      ? venda.pagamentos.map((p) => ({
          formaPagamento: asFormaPagamento(p.forma_pagamento),
          valor: p.valor,
        }))
      : [{ formaPagamento: asFormaPagamento(venda.forma_pagamento ?? ""), valor: venda.total_liquido }]

  return {
    vendaId: venda.id,
    data: Number.isNaN(data.getTime()) ? new Date() : data,
    clienteNome: venda.cliente_nome,
    itens: venda.itens.map((i) => ({
      nome: i.nome,
      quantidade: i.quantidade,
      precoUnitario: i.preco_unitario,
      precoOriginal: i.preco_unitario_original,
      tipoPreco: i.tipo_preco || "VAREJO",
    })),
    pagamentos,
    totalBruto: venda.total_bruto,
    totalDesconto: venda.total_desconto,
    totalLiquidoComGerente: venda.total_liquido,
    descontoGerentePercentual: Math.max(0, venda.desconto_gerente_percentual),
    valorDescontoGerente: Math.max(0, venda.desconto_gerente_valor),
    moeda,
  }
}
