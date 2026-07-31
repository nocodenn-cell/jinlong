/** @vitest-environment jsdom */
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  useCaixaPagamentos,
  type ParcelaPagamento,
} from "@/app/caixa/hooks/useCaixaPagamentos"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

let api: ReturnType<typeof useCaixaPagamentos> | null = null

function Harness({ total }: { total: number }) {
  api = useCaixaPagamentos(total)
  return null
}

/** Renderiza com um total novo e drena os efeitos do hook. */
function render(total: number) {
  act(() => {
    root.render(<Harness total={total} />)
  })
}

function valores(): number[] {
  return (api?.pagamentos ?? []).map((p: ParcelaPagamento) => p.valor)
}

describe("useCaixaPagamentos — reajuste ao mudar o total", () => {
  it("parcela única ainda zerada acompanha o total", () => {
    render(0)
    render(80)
    expect(valores()).toEqual([80])
  })

  it("parcela única já digitada não é sobrescrita", () => {
    render(100)
    act(() => api?.atualizarValor(0, 40))
    render(120)
    expect(valores()).toEqual([40])
  })

  it("com 2+ parcelas, a última absorve a mudança do total", () => {
    render(100)
    act(() => api?.atualizarValor(0, 50))
    act(() => api?.adicionarParcela("PIX"))
    act(() => api?.autoCompletarUltima())
    expect(valores()).toEqual([50, 50])

    // Operador remove um item: o restante migra para a última parcela sem que
    // ele tenha que clicar "Auto-completar" outra vez.
    render(60)
    expect(valores()).toEqual([50, 10])
    expect(api?.somaParcelas).toBe(60)
    expect(api?.diferenca).toBe(0)
  })

  it("não gera parcela negativa quando o total cai abaixo das parcelas anteriores", () => {
    render(100)
    act(() => api?.atualizarValor(0, 90))
    act(() => api?.adicionarParcela("PIX"))
    act(() => api?.autoCompletarUltima())
    expect(valores()).toEqual([90, 10])

    render(30)
    expect(valores()).toEqual([90, 0])
  })
})
