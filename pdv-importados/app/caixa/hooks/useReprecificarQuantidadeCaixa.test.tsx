/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react-dom/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useCarrinhoStore } from "@/stores/carrinhoStore"
import { DEFAULT_PRICING_CONTEXT } from "@shared/pricing/types"
import {
  useReprecificarQuantidadeCaixa,
  type ReprecificarQuantidadeInput,
} from "@/app/caixa/hooks/useReprecificarQuantidadeCaixa"

const calcularPrecoProdutoCaixaMock = vi.fn()

vi.mock("@/app/caixa/actions", () => ({
  calcularPrecoProdutoCaixa: (input: unknown) => calcularPrecoProdutoCaixaMock(input),
}))

function resetCarrinhoStore() {
  useCarrinhoStore.setState({
    itens: [],
    regras: [],
    pricingCtx: DEFAULT_PRICING_CONTEXT,
    cartOwnerUserId: null,
    totalBruto: 0,
    totalDesconto: 0,
    totalLiquido: 0,
    totalItens: 0,
    totalUnidades: 0,
    ultimoRemovido: null,
  })
}

function seedItemVarejo() {
  useCarrinhoStore.getState().adicionarItem({
    id: "item-1",
    produtoId: "produto-1",
    nome: "Produto A",
    quantidade: 1,
    precoUnitario: 25,
    precoOriginal: 25,
  })
}

let reprecificarAtual: ((input: ReprecificarQuantidadeInput) => void) | null = null

function TestHarness() {
  const { reprecificar } = useReprecificarQuantidadeCaixa()
  reprecificarAtual = reprecificar
  return null
}

describe("useReprecificarQuantidadeCaixa", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    resetCarrinhoStore()
    calcularPrecoProdutoCaixaMock.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(<TestHarness />)
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  it("mudar quantidade atravessando faixa atualiza preço para ATACADO", async () => {
    seedItemVarejo()
    calcularPrecoProdutoCaixaMock.mockResolvedValue({ ok: true, preco: 21, tipo: "ATACADO" })

    await act(async () => {
      reprecificarAtual?.({
        itemId: "item-1",
        produtoId: "produto-1",
        quantidade: 60,
        tipoPrecoAtual: "VAREJO",
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(calcularPrecoProdutoCaixaMock).toHaveBeenCalledWith({
      produtoId: "produto-1",
      quantidade: 60,
    })
    const item = useCarrinhoStore.getState().itens[0]
    expect(item?.resultado?.tipoPreco).toBe("ATACADO")
    expect(item?.resultado?.precoUnitario).toBe(21)
    expect(item?.resultado?.precoOriginal).toBe(25)
  })

  it("linha MANUAL não dispara recálculo", () => {
    seedItemVarejo()

    reprecificarAtual?.({
      itemId: "item-1",
      produtoId: "produto-1",
      quantidade: 60,
      tipoPrecoAtual: "MANUAL",
    })

    expect(calcularPrecoProdutoCaixaMock).not.toHaveBeenCalled()
  })

  it("linha PROMOCAO não dispara recálculo", () => {
    seedItemVarejo()

    reprecificarAtual?.({
      itemId: "item-1",
      produtoId: "produto-1",
      quantidade: 60,
      tipoPrecoAtual: "PROMOCAO",
    })

    expect(calcularPrecoProdutoCaixaMock).not.toHaveBeenCalled()
  })

  it("digitação (debounce) só chama a RPC uma vez, com a última quantidade", async () => {
    vi.useFakeTimers()
    seedItemVarejo()
    calcularPrecoProdutoCaixaMock.mockResolvedValue({ ok: true, preco: 21, tipo: "ATACADO" })

    act(() => {
      reprecificarAtual?.({
        itemId: "item-1",
        produtoId: "produto-1",
        quantidade: 6,
        tipoPrecoAtual: "VAREJO",
        debounce: true,
      })
    })
    act(() => {
      reprecificarAtual?.({
        itemId: "item-1",
        produtoId: "produto-1",
        quantidade: 60,
        tipoPrecoAtual: "VAREJO",
        debounce: true,
      })
    })

    expect(calcularPrecoProdutoCaixaMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(calcularPrecoProdutoCaixaMock).toHaveBeenCalledTimes(1)
    expect(calcularPrecoProdutoCaixaMock).toHaveBeenCalledWith({
      produtoId: "produto-1",
      quantidade: 60,
    })
  })

  it("resposta obsoleta (quantidade mudou de novo antes do round-trip voltar) é descartada", async () => {
    seedItemVarejo()
    let resolvePrimeira: ((v: unknown) => void) | null = null
    calcularPrecoProdutoCaixaMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePrimeira = resolve
          }),
      )
      .mockResolvedValueOnce({ ok: true, preco: 19, tipo: "ATACADO" })

    await act(async () => {
      reprecificarAtual?.({
        itemId: "item-1",
        produtoId: "produto-1",
        quantidade: 60,
        tipoPrecoAtual: "VAREJO",
      })
      await Promise.resolve()
    })

    await act(async () => {
      reprecificarAtual?.({
        itemId: "item-1",
        produtoId: "produto-1",
        quantidade: 100,
        tipoPrecoAtual: "VAREJO",
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      resolvePrimeira?.({ ok: true, preco: 21, tipo: "ATACADO" })
      await Promise.resolve()
      await Promise.resolve()
    })

    const item = useCarrinhoStore.getState().itens[0]
    expect(item?.resultado?.precoUnitario).toBe(19)
  })
})
