/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CaixaEmAbertoList } from "@/app/caixa/CaixaEmAbertoList"

const m = {
  caixa: {
    em_aberto_pedido: "Pedido #{{n}}",
    em_aberto_item: "item",
    em_aberto_itens: "itens",
    em_aberto_retomar: "Retomar",
    em_aberto_descartar: "Descartar",
    em_aberto_motivo_label: "Motivo do descarte",
    em_aberto_motivo_confirmar: "Confirmar descarte",
    em_aberto_motivo_cancelar: "Cancelar",
    em_aberto_motivo_minimo: "Informe o motivo (mínimo de 3 caracteres).",
    em_aberto_vazio: "Nenhuma venda em espera",
    moeda_prefixo: "R$",
  },
  comum: { carregando: "Carregando" },
} as never

const VENDA = { id: "v-1", numeroLocal: 1, totalLiquido: 22.5, qtdItens: 1 } as never

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function render(onDescartar: (id: string, motivo: string) => void) {
  flushSync(() => {
    root.render(
      <CaixaEmAbertoList
        m={m}
        vendas={[VENDA]}
        onRetomar={() => {}}
        onDescartar={onDescartar}
      />,
    )
  })
}

function botao(texto: RegExp): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll("button")).find((el) => texto.test(el.textContent ?? ""))
  if (!b) throw new Error(`botão não encontrado: ${texto}`)
  return b as HTMLButtonElement
}

function digitar(valor: string) {
  const input = container.querySelector("input") as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  flushSync(() => {
    setter.call(input, valor)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

describe("CaixaEmAbertoList — motivo obrigatório no descarte (RN-03)", () => {
  it("o descarte não é enviado sem motivo: o botão de confirmar fica desabilitado", () => {
    const onDescartar = vi.fn()
    render(onDescartar)
    flushSync(() => botao(/^Descartar$/).click())
    expect(botao(/Confirmar descarte/).disabled).toBe(true)
    digitar("ab")
    expect(botao(/Confirmar descarte/).disabled).toBe(true)
    expect(onDescartar).not.toHaveBeenCalled()
  })

  it("com motivo de 3+ caracteres envia id e motivo aparados", () => {
    const onDescartar = vi.fn()
    render(onDescartar)
    flushSync(() => botao(/^Descartar$/).click())
    digitar("  Cliente desistiu  ")
    flushSync(() => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(onDescartar).toHaveBeenCalledWith("v-1", "Cliente desistiu")
  })

  it("cancelar fecha o campo sem descartar", () => {
    const onDescartar = vi.fn()
    render(onDescartar)
    flushSync(() => botao(/^Descartar$/).click())
    flushSync(() => botao(/^Cancelar$/).click())
    expect(container.querySelector("input")).toBeNull()
    expect(onDescartar).not.toHaveBeenCalled()
  })
})
