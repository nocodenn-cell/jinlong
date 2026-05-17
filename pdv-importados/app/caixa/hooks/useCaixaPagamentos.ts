"use client"

import { useState, useMemo, useCallback } from "react"
import { roundMoney2, type FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import {
  metodoPagamentoToForma,
  type MetodoPagamentoUi,
} from "@/app/caixa/caixaMetodoPagamento"

export type PagamentoLinha = {
  id: string
  metodo: MetodoPagamentoUi
  valor: string
}

let _linhaSeq = 0
function novaLinha(metodo: MetodoPagamentoUi = "dinheiro", valor = "0"): PagamentoLinha {
  return { id: `linha-${++_linhaSeq}`, metodo, valor }
}

export function useCaixaPagamentos(totalLiquidoComGerente: number) {
  const [linhas, setLinhas] = useState<PagamentoLinha[]>(() => [
    novaLinha("dinheiro", Math.max(0, totalLiquidoComGerente).toFixed(2)),
  ])

  const pagamentos = useMemo(
    (): Array<{ formaPagamento: FinalizarVendaInput["formaPagamento"]; valor: number }> =>
      linhas.map((l) => ({
        formaPagamento: metodoPagamentoToForma(l.metodo),
        valor: roundMoney2(Math.max(0, parseFloat(l.valor) || 0)),
      })),
    [linhas],
  )

  const totalInformado = useMemo(
    () => roundMoney2(pagamentos.reduce((acc, p) => acc + p.valor, 0)),
    [pagamentos],
  )

  const restante = useMemo(
    () => roundMoney2(totalLiquidoComGerente - totalInformado),
    [totalLiquidoComGerente, totalInformado],
  )

  const valido = Math.abs(restante) <= 0.01

  const adicionarLinha = useCallback(() => {
    setLinhas((prev) => [...prev, novaLinha("dinheiro", "0")])
  }, [])

  const removerLinha = useCallback((id: string) => {
    setLinhas((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev))
  }, [])

  const setMetodo = useCallback((id: string, metodo: MetodoPagamentoUi) => {
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, metodo } : l)))
  }, [])

  const setValor = useCallback((id: string, valor: string) => {
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, valor } : l)))
  }, [])

  const resetPagamentos = useCallback(() => {
    setLinhas([novaLinha("dinheiro", Math.max(0, totalLiquidoComGerente).toFixed(2))])
  }, [totalLiquidoComGerente])

  return {
    linhas,
    pagamentos,
    totalInformado,
    restante,
    valido,
    adicionarLinha,
    removerLinha,
    setMetodo,
    setValor,
    resetPagamentos,
  }
}
