import type { FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"

/** Valor da UI do seletor de forma de pagamento (uma parcela por venda). */
export type MetodoPagamentoUi = "dinheiro" | "pix" | "debito" | "credito"

const FORMA_BY_METODO: Record<MetodoPagamentoUi, FinalizarVendaInput["formaPagamento"]> = {
  dinheiro: "DINHEIRO",
  pix: "PIX",
  debito: "CARTAO_DEBITO",
  credito: "CARTAO_CREDITO",
}

export function metodoPagamentoToForma(
  metodo: MetodoPagamentoUi,
): FinalizarVendaInput["formaPagamento"] {
  return FORMA_BY_METODO[metodo]
}
