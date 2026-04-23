"use client"

import { useCallback, useEffect, useState } from "react"
import {
  roundMoney2,
  type FinalizarVendaInput,
} from "@/app/caixa/finalizarVendaValidation"

export function useCaixaPagamentos(totalLiquidoComGerente: number) {
  const pagamentoInicial = useCallback(
    (valor: number): { formaPagamento: FinalizarVendaInput["formaPagamento"]; valor: number } => ({
      formaPagamento: "DINHEIRO",
      valor: roundMoney2(Math.max(0, valor)),
    }),
    [],
  )

  const [pagamentos, setPagamentos] = useState<
    Array<{ formaPagamento: FinalizarVendaInput["formaPagamento"]; valor: number }>
  >(() => [pagamentoInicial(0)])

  useEffect(() => {
    setPagamentos((prev) => {
      if (prev.length <= 1) {
        return [
          {
            formaPagamento: prev[0]?.formaPagamento ?? "DINHEIRO",
            valor: totalLiquidoComGerente,
          },
        ]
      }
      const somaSemUltimo = prev.slice(0, -1).reduce((acc, p) => acc + p.valor, 0)
      const ultimo = Math.max(0, roundMoney2(totalLiquidoComGerente - somaSemUltimo))
      return [...prev.slice(0, -1), { ...prev[prev.length - 1], valor: ultimo }]
    })
  }, [totalLiquidoComGerente])

  const handlePagamentoFormaChange = useCallback(
    (index: number, forma: FinalizarVendaInput["formaPagamento"]) => {
      setPagamentos((prev) =>
        prev.map((p, i) => (i === index ? { ...p, formaPagamento: forma } : p)),
      )
    },
    [],
  )

  const handlePagamentoValorChange = useCallback((index: number, valor: number) => {
    const v = Number.isFinite(valor) && valor > 0 ? roundMoney2(valor) : 0
    setPagamentos((prev) => prev.map((p, i) => (i === index ? { ...p, valor: v } : p)))
  }, [])

  const handleAdicionarPagamento = useCallback(() => {
    setPagamentos((prev) => {
      if (prev.length >= 4) return prev
      const restante = Math.max(
        0,
        roundMoney2(totalLiquidoComGerente - prev.reduce((acc, p) => acc + p.valor, 0)),
      )
      return [...prev, { formaPagamento: "PIX" as const, valor: restante }]
    })
  }, [totalLiquidoComGerente])

  const handleRemoverPagamento = useCallback(
    (index: number) => {
      setPagamentos((prev) => {
        if (prev.length <= 1) return prev
        const next = prev.filter((_, i) => i !== index)
        const soma = next.reduce((acc, p) => acc + p.valor, 0)
        if (next.length > 0) {
          const ajuste = Math.max(0, roundMoney2(totalLiquidoComGerente - soma))
          next[next.length - 1] = {
            ...next[next.length - 1],
            valor: next[next.length - 1].valor + ajuste,
          }
        }
        return next
      })
    },
    [totalLiquidoComGerente],
  )

  const resetPagamentos = useCallback(() => {
    setPagamentos([pagamentoInicial(0)])
  }, [pagamentoInicial])

  return {
    pagamentos,
    pagamentoInicial,
    handlePagamentoFormaChange,
    handlePagamentoValorChange,
    handleAdicionarPagamento,
    handleRemoverPagamento,
    resetPagamentos,
  }
}
