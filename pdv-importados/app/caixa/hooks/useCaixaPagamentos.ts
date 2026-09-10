"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import {
  roundMoney2,
  FORMAS_PAGAMENTO_CAIXA,
  type FinalizarVendaInput,
} from "@/app/caixa/finalizarVendaValidation"
import { calcularResumoParcelas } from "@/app/caixa/caixaPagamentoSaldo"

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
      // Parcela única: atualizar valor se for vazio/zerado
      if (old.length === 1) {
        const currentValor = old[0].valor
        if (currentValor <= 0.009) {
          return [{ ...old[0], valor: roundMoney2(Math.max(0, totalLiquidoComGerente)) }]
        }
        return old
      }
      // Múltiplas parcelas: ajustar a última quando o total mudar
      // (ex: desconto gerente aplicado/removido, carrinho alterado)
      const somaOutras = old.slice(0, -1).reduce((s, p) => s + p.valor, 0)
      const novoRestante = roundMoney2(Math.max(0, totalLiquidoComGerente - somaOutras))
      const copy = [...old]
      copy[copy.length - 1] = { ...copy[copy.length - 1], valor: novoRestante }
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
        if (old[0].valor <= 0.009) {
          return [{ ...old[0], valor: roundMoney2(Math.max(0, totalLiquidoComGerente)) }]
        }
        return old
      }
      const somaOutras = old.slice(0, -1).reduce((s, p) => s + p.valor, 0)
      const restante = roundMoney2(Math.max(0, totalLiquidoComGerente - somaOutras))
      const copy = [...old]
      copy[copy.length - 1] = { ...copy[copy.length - 1], valor: restante }
      return copy
    })
  }, [totalLiquidoComGerente])

  /**
   * Encerra/abandona o cupom: volta a UMA parcela ZERADA.
   *
   * Zerar é o contrato — não "reiniciar com o total". Os três chamadores
   * (venda concluída, novo cupom, recuperação de venda pendente) limpam o
   * carrinho na mesma passagem, mas `totalLiquidoComGerente` ainda é o do
   * cupom ANTERIOR nesta closure (o state do carrinho só reflete no próximo
   * render). Reiniciar com esse total deixava o "Recebido" preso no valor da
   * venda anterior: o efeito de reajuste abaixo só repõe a parcela única
   * quando ela está <= 0.009, então um valor herdado nunca era corrigido e
   * o cupom SEGUINTE abria com "Recebido" e "Troco" fantasmas (ex.: venda de
   * R$ 22,50 exibindo troco de R$ 30,30 sem o cliente ter entregue nada).
   *
   * Com a parcela zerada, esse mesmo efeito volta a preenchê-la com o total
   * assim que o primeiro item do próximo cupom entra — que é o comportamento
   * que o operador já vê hoje na primeira leitura.
   */
  const resetPagamentos = useCallback(() => {
    setParcelas(parcelaInicial(formaPagamento ?? "DINHEIRO", 0))
  }, [formaPagamento])

  const { somaParcelas, diferenca, saldoPendente } = calcularResumoParcelas(
    totalLiquidoComGerente,
    parcelas.reduce((s, p) => s + p.valor, 0),
  )

  return {
    pagamentos: parcelas,
    somaParcelas,
    diferenca,
    saldoPendente,
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
