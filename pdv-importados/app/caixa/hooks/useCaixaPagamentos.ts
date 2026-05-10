"use client"

import { useMemo, useCallback } from "react"
import {
  roundMoney2,
  type FinalizarVendaInput,
} from "@/app/caixa/finalizarVendaValidation"

/** Uma única parcela em dinheiro com valor igual ao total — UI de split foi removida do PDV. */
export function useCaixaPagamentos(totalLiquidoComGerente: number) {
  const pagamentos = useMemo(
    (): Array<{
      formaPagamento: FinalizarVendaInput["formaPagamento"]
      valor: number
    }> => [
      {
        formaPagamento: "DINHEIRO",
        valor: roundMoney2(Math.max(0, totalLiquidoComGerente)),
      },
    ],
    [totalLiquidoComGerente],
  )

  const resetPagamentos = useCallback(() => {}, [])

  return {
    pagamentos,
    resetPagamentos,
  }
}
