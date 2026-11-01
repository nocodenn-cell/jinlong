// @vitest-environment jsdom
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { pagamentoParcelaSchema, finalizarVendaInputSchema } from "@/app/caixa/finalizarVendaValidation"
import { useCaixaPagamentos } from "@/app/caixa/hooks/useCaixaPagamentos"

const base = {
  formaPagamento: "CARTAO_CREDITO" as const,
  totalBruto: 100,
  totalDesconto: 0,
  totalLiquido: 100,
  itens: [{ produtoId: "11111111-1111-4111-8111-111111111111", quantidade: 1, precoOriginal: 100, precoUnitario: 100, tipoPreco: "VAREJO" as const }],
}

describe("parcelas do crédito — contrato do caixa web", () => {
  it("sem parcelas continua válido (contrato anterior)", () => {
    expect(pagamentoParcelaSchema.safeParse({ formaPagamento: "PIX", valor: 10 }).success).toBe(true)
  })
  it("crédito 1..24 aceito; fora disso ou em outra forma recusado", () => {
    expect(pagamentoParcelaSchema.safeParse({ formaPagamento: "CARTAO_CREDITO", valor: 10, parcelas: 12 }).success).toBe(true)
    expect(pagamentoParcelaSchema.safeParse({ formaPagamento: "CARTAO_CREDITO", valor: 10, parcelas: 25 }).success).toBe(false)
    expect(pagamentoParcelaSchema.safeParse({ formaPagamento: "CARTAO_CREDITO", valor: 10, parcelas: 0 }).success).toBe(false)
    expect(pagamentoParcelaSchema.safeParse({ formaPagamento: "CARTAO_CREDITO", valor: 10, parcelas: 2.5 }).success).toBe(false)
    expect(pagamentoParcelaSchema.safeParse({ formaPagamento: "CARTAO_DEBITO", valor: 10, parcelas: 2 }).success).toBe(false)
    expect(pagamentoParcelaSchema.safeParse({ formaPagamento: "PIX", valor: 10, parcelas: 1 }).success).toBe(true)
  })
  it("venda combinada dinheiro + crédito 6x passa no schema da finalização", () => {
    const r = finalizarVendaInputSchema.safeParse({
      ...base,
      formaPagamento: "DINHEIRO",
      pagamentos: [{ formaPagamento: "DINHEIRO", valor: 40 }, { formaPagamento: "CARTAO_CREDITO", valor: 60, parcelas: 6 }],
    })
    expect(r.success).toBe(true)
  })
  it("hook: define parcelas só no crédito e limpa ao trocar de forma", () => {
    const { result } = renderHookSemTestingLibrary(() => useCaixaPagamentos(100, "CARTAO_CREDITO"))
    flushSync(() => result.current.atualizarParcelas(0, 3))
    expect(result.current.pagamentos[0]).toEqual({ formaPagamento: "CARTAO_CREDITO", valor: 100, parcelas: 3 })
    flushSync(() => result.current.atualizarParcelas(0, 99))
    expect(result.current.pagamentos[0].parcelas).toBe(24)
    flushSync(() => result.current.atualizarParcelas(0, 1))
    expect(result.current.pagamentos[0]).toEqual({ formaPagamento: "CARTAO_CREDITO", valor: 100 })
    flushSync(() => result.current.atualizarParcelas(0, 4))
    flushSync(() => result.current.atualizarForma(0, "PIX"))
    expect(result.current.pagamentos[0]).toEqual({ formaPagamento: "PIX", valor: 100 })
    flushSync(() => result.current.atualizarParcelas(0, 4))
    expect(result.current.pagamentos[0].parcelas).toBeUndefined()
  })
})

/**
 * Renderiza um hook com `react-dom` da própria árvore, como os demais testes de hook do
 * repositório. Não usa `@testing-library/react`: esse pacote não é dependência de
 * `pdv-importados`, e na árvore do worktree é resolvido para o checkout pai, com uma
 * segunda cópia de React (o hook chama `useState` com dispatcher nulo).
 */
function renderHookSemTestingLibrary<T>(hook: () => T): { result: { current: T } } {
  const result = { current: undefined as unknown as T }
  function Harness() {
    result.current = hook()
    return null
  }
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  flushSync(() => root.render(React.createElement(Harness)))
  return { result }
}
