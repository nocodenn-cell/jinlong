/** @vitest-environment jsdom */
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CaixaSearchBar } from "./CaixaSearchBar"

// Auditoria UI/UX P0-1: o campo de busca nasce desabilitado enquanto as regras carregam.
// `focus()` nele é no-op, então o foco precisa acontecer quando ele for habilitado.

const m = {
  caixa: {
    adicionar_enter: "Adicionar",
    busca_dica: "Dica",
    busca_placeholder: "Código de barras",
    buscando: "Buscando",
    novo_cupom: "Novo cupom",
    som_feedback_desligado: "Som desligado",
    som_feedback_ligado: "Som ligado",
  },
} as never

let container: HTMLDivElement
let root: Root

function renderBar(carregandoRegras: boolean, extra?: React.ReactNode) {
  return (
    <>
      <CaixaSearchBar
        m={m}
        codigo=""
        onCodigoChange={() => {}}
        onSubmit={(e) => e.preventDefault()}
        onNovoCupom={() => {}}
        buscando={false}
        carregandoRegras={carregandoRegras}
        somAtivo={false}
        onToggleSom={() => {}}
        hideSomToggle
      />
      {extra}
    </>
  )
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("CaixaSearchBar — foco ao habilitar", () => {
  it("foca o campo quando as regras terminam de carregar (foco solto)", () => {
    act(() => root.render(renderBar(true)))
    const input = container.querySelector("input")!
    expect(input.disabled).toBe(true)
    expect(document.activeElement).not.toBe(input)

    act(() => root.render(renderBar(false)))
    expect(input.disabled).toBe(false)
    expect(document.activeElement).toBe(input)
  })

  it("não rouba o foco de outro campo do fluxo de venda", () => {
    act(() => root.render(renderBar(true, <input data-testid="parcela" />)))
    const parcela = container.querySelector<HTMLInputElement>('[data-testid="parcela"]')!
    act(() => parcela.focus())

    act(() => root.render(renderBar(false, <input data-testid="parcela" />)))
    expect(document.activeElement).toBe(parcela)
  })
})
