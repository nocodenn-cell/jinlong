"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import {
  roundMoney2,
  FORMAS_PAGAMENTO_CAIXA,
  type FinalizarVendaInput,
} from "@/app/caixa/finalizarVendaValidation"

export type FormaPagamento = FinalizarVendaInput["formaPagamento"]

export type ParcelaPagamento = {
  formaPagamento: FormaPagamento
  valor: number
}

const MAX_PARCELAS = 4

function parcelaInicial(forma: FormaPagamento, total: number): ParcelaPagamento[] {
  return [{ formaPagamento: forma, valor: roundMoney2(Math.max(0, total)) }]
}

export function useCaixaPagamentos(
  totalLiquidoComGerente: number,
  formaPagamento?: FormaPagamento,
) {
  const [parcelas, setParcelas] = useState<ParcelaPagamento[]>(() =>
    parcelaInicial(formaPagamento ?? "DINHEIRO", totalLiquidoComGerente),
  )

  const prevTotalRef = useRef(totalLiquidoComGerente)
  const prevFormaRef = useRef(formaPagamento)

  useEffect(() => {
    if (formaPagamento && formaPagamento !== prevFormaRef.current) {
      prevFormaRef.current = formaPagamento
      setParcelas((old) => {
        if (old.length === 1) {
          return [{ ...old[0], formaPagamento }]
        }
        return old
      })
    }
  }, [formaPagamento])

  useEffect(() => {
    const prev = prevTotalRef.current
    prevTotalRef.current = totalLiquidoComGerente
    if (Math.abs(prev - totalLiquidoComGerente) < 0.005) return

    setParcelas((old) => {
      if (old.length === 1) {
        return [{ ...old[0], valor: roundMoney2(Math.max(0, totalLiquidoComGerente)) }]
      }
      const somaOutras = old.slice(0, -1).reduce((s, p) => s + p.valor, 0)
      const restante = roundMoney2(Math.max(0, totalLiquidoComGerente - somaOutras))
      const copy = [...old]
      copy[copy.length - 1] = { ...copy[copy.length - 1], valor: restante }
      return copy
    })
  }, [totalLiquidoComGerente])

  const adicionarParcela = useCallback(
    (forma: FormaPagamento = "PIX") => {
      setParcelas((old) => {
        if (old.length >= MAX_PARCELAS) return old
        return [...old, { formaPagamento: forma, valor: 0 }]
      })
    },
    [],
  )

  const removerParcela = useCallback((index: number) => {
    setParcelas((old) => {
      if (old.length <= 1 || index < 0 || index >= old.length) return old
      return old.filter((_, i) => i !== index)
    })
  }, [])

  const atualizarForma = useCallback((index: number, forma: FormaPagamento) => {
    setParcelas((old) =>
      old.map((p, i) => (i === index ? { ...p, formaPagamento: forma } : p)),
    )
  }, [])

  const atualizarValor = useCallback((index: number, valor: number) => {
    setParcelas((old) =>
      old.map((p, i) =>
        i === index ? { ...p, valor: roundMoney2(Math.max(0, valor)) } : p,
      ),
    )
  }, [])

  const autoCompletarUltima = useCallback(() => {
    setParcelas((old) => {
      if (old.length < 2) {
        return [{ ...old[0], valor: roundMoney2(Math.max(0, totalLiquidoComGerente)) }]
      }
      const somaOutras = old.slice(0, -1).reduce((s, p) => s + p.valor, 0)
      const restante = roundMoney2(Math.max(0, totalLiquidoComGerente - somaOutras))
      const copy = [...old]
      copy[copy.length - 1] = { ...copy[copy.length - 1], valor: restante }
      return copy
    })
  }, [totalLiquidoComGerente])

  const resetPagamentos = useCallback(() => {
    setParcelas(parcelaInicial(formaPagamento ?? "DINHEIRO", totalLiquidoComGerente))
  }, [totalLiquidoComGerente, formaPagamento])

  const somaParcelas = roundMoney2(parcelas.reduce((s, p) => s + p.valor, 0))
  const diferenca = roundMoney2(somaParcelas - totalLiquidoComGerente)

  return {
    pagamentos: parcelas,
    somaParcelas,
    diferenca,
    podeAdicionarParcela: parcelas.length < MAX_PARCELAS,
    formasDisponiveis: FORMAS_PAGAMENTO_CAIXA,
    adicionarParcela,
    removerParcela,
    atualizarForma,
    atualizarValor,
    autoCompletarUltima,
    resetPagamentos,
  }
}
