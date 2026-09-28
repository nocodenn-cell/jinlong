/** @vitest-environment jsdom */
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  useCaixaPagamentos,
  type FormaPagamento,
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

function Harness({ total, forma }: { total: number; forma?: FormaPagamento }) {
  api = useCaixaPagamentos(total, forma)
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

describe("useCaixaPagamentos — recebido acompanha o total sem edição manual", () => {
  it("2º item adicionado ao carrinho atualiza o recebido auto-preenchido pelo 1º", () => {
    // Bug relatado por browser audit: total 25,90 -> 51,80 ao somar um 2º
    // item, mas "Recebido" ficava preso em 25,90 (valor que o próprio hook
    // tinha auto-preenchido para o 1º item, nunca digitado pelo operador).
    render(0)
    render(25.9)
    expect(valores()).toEqual([25.9])

    render(51.8)
    expect(valores()).toEqual([51.8])
  })

  it("troca de forma de pagamento não deixa valor obsoleto (ex.: PIX herdando valor digitado em DINHEIRO)", () => {
    act(() => {
      root.render(<Harness total={51.8} forma="DINHEIRO" />)
    })
    act(() => api?.atualizarValor(0, 25.9))
    expect(valores()).toEqual([25.9])

    act(() => {
      root.render(<Harness total={51.8} forma="PIX" />)
    })
    expect(valores()).toEqual([51.8])
    expect(api?.pagamentos.map((p: ParcelaPagamento) => p.formaPagamento)).toEqual(["PIX"])
  })
})

describe("useCaixaPagamentos — resetPagamentos encerra o cupom", () => {
  /**
   * Reproduz a sequência real do caixa: os chamadores de `resetPagamentos`
   * limpam o carrinho na mesma passagem, então o hook ainda recebe o total do
   * cupom ANTERIOR quando o reset roda; só no render seguinte o total cai a 0.
   */
  it("zera o recebido mesmo sendo chamado antes de o total cair a zero", () => {
    render(52.8)
    expect(valores()).toEqual([52.8])

    act(() => api?.resetPagamentos())
    render(0)

    expect(valores()).toEqual([0])
  })

  it("não vaza recebido/troco fantasma para o cupom seguinte", () => {
    // Venda 1: R$ 52,80 em dinheiro, finalizada.
    render(52.8)
    act(() => api?.resetPagamentos())
    render(0)

    // Venda 2: primeiro item de R$ 22,50 — o recebido acompanha o novo total,
    // sem sobra da venda anterior (antes: ficava 52,80 → troco de R$ 30,30).
    render(22.5)

    expect(valores()).toEqual([22.5])
    expect(api?.diferenca).toBe(0)
  })

  it("preserva a forma de pagamento corrente ao resetar", () => {
    act(() => {
      root.render(<Harness total={40} forma="PIX" />)
    })
    act(() => api?.resetPagamentos())
    act(() => {
      root.render(<Harness total={0} forma="PIX" />)
    })

    expect(api?.pagamentos.map((p: ParcelaPagamento) => p.formaPagamento)).toEqual(["PIX"])
    expect(valores()).toEqual([0])
  })
})
