/**
 * Modelo do cupom de venda (não fiscal) — fonte única para o modal (HTML) e para o ESC/POS.
 * Vive fora de componentes para que `lib/` e hooks não dependam de UI.
 */
import type { FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import type { Mensagens } from "@/i18n/getMessages"

export type ReciboItem = {
  nome: string
  quantidade: number
  precoUnitario: number
  precoOriginal: number
  tipoPreco: string
}

export type ReciboVenda = {
  vendaId: string
  data: Date
  /** Cliente vinculado à venda (ex.: venda fiado) — `null` quando anônima ou indisponível (reimpressão). */
  clienteNome: string | null
  itens: ReciboItem[]
  pagamentos: Array<{ formaPagamento: FinalizarVendaInput["formaPagamento"]; valor: number }>
  totalBruto: number
  totalDesconto: number
  totalLiquidoComGerente: number
  descontoGerentePercentual: number
  valorDescontoGerente: number
  moeda: string
}

/** Rótulos do cupom já resolvidos no idioma do operador — compartilhados entre a tela e o ESC/POS. */
export type ReciboLabels = {
  titulo: string
  cliente: string
  subtotal: string
  descontoProdutos: string
  descontoGerente: string
  total: string
  pagamento: string
  rodapeObrigado: string
  rodapeNaoFiscal: string
  atacado: string
  /** Forma de pagamento (DINHEIRO/PIX/CARTAO_DEBITO/CARTAO_CREDITO) → rótulo traduzido. */
  formas: Record<string, string>
}

/** Monta os rótulos do cupom a partir do dicionário ativo (pt/zh). */
export function buildReciboLabels(m: Mensagens): ReciboLabels {
  const r = m.caixa.recibo
  return {
    titulo: r.titulo,
    cliente: r.cliente,
    subtotal: r.subtotal,
    descontoProdutos: r.desconto_produtos,
    descontoGerente: r.desconto_gerente,
    total: r.total,
    pagamento: r.pagamento,
    rodapeObrigado: r.rodape_obrigado,
    rodapeNaoFiscal: r.rodape_nao_fiscal,
    atacado: r.atacado,
    formas: {
      DINHEIRO: m.caixa.pdv_metodo_pagamento_dinheiro,
      PIX: m.caixa.pdv_metodo_pagamento_pix,
      CARTAO_DEBITO: m.caixa.pdv_metodo_pagamento_debito,
      CARTAO_CREDITO: m.caixa.pdv_metodo_pagamento_credito,
    },
  }
}
