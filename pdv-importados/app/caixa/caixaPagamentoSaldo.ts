import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'

/** Limiar alinhado a `caixaVendas.impl` / RPC v4 (Fase 5b). */
export const SALDO_PENDENTE_EPS = 0.009

export type ResumoParcelas = {
  somaParcelas: number
  diferenca: number
  saldoPendente: number
}

/** Totais do painel de parcelas (Web caixa). */
export function calcularResumoParcelas(
  totalLiquido: number,
  somaParcelasRaw: number,
): ResumoParcelas {
  const somaParcelas = roundMoney2(somaParcelasRaw)
  const total = roundMoney2(totalLiquido)
  return {
    somaParcelas,
    diferenca: roundMoney2(somaParcelas - total),
    saldoPendente: roundMoney2(total - somaParcelas),
  }
}

/** Pagamento parcial (crédito) exige cliente da loja. */
export function pagamentoParcialExigeCliente(
  saldoPendente: number,
  clienteId: string | null | undefined,
): boolean {
  return saldoPendente > SALDO_PENDENTE_EPS && !clienteId
}
