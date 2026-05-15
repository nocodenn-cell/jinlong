"use client"

import { useMemo, useCallback } from "react"
import {
  roundMoney2,
  type FinalizarVendaInput,
} from "@/app/caixa/finalizarVendaValidation"

/** Uma única parcela com valor igual ao total — forma escolhida pelo operador. */
export function useCaixaPagamentos(
  totalLiquidoComGerente: number,
  formaPagamento: FinalizarVendaInput["formaPagamento"],
) {
  const pagamentos = useMemo(
    (): Array<{
      formaPagamento: FinalizarVendaInput["formaPagamento"]
      valor: number
    }> => [
      {
        formaPagamento,
        valor: roundMoney2(Math.max(0, totalLiquidoComGerente)),
      },
    ],
    [totalLiquidoComGerente, formaPagamento],
  )

  const resetPagamentos = useCallback(() => {}, [])

  return {
    pagamentos,
    resetPagamentos,
  }
}
