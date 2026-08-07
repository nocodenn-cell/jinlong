/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CaixaSearchBar } from "@/app/caixa/CaixaSearchBar"
import type { Mensagens } from "@/i18n/getMessages"

/**
 * Teclado do seletor de candidatos (`status: 'multiplos'`).
 *
 * Invariante: o foco permanece no campo de busca. Se ele saísse para a lista, o
 * operador perderia a capacidade de refinar o termo sem clicar de volta — que é
 * justamente o gesto que a lista existe para evitar.
 */

const mockMensagens = {
  caixa: {
    busca_placeholder: "Código ou nome",
    busca_dica: "dica",
    adicionar_enter: "Adicionar (Enter)",
    buscando: "Buscando…",
    novo_cupom: "Novo cupom",
    som_feedback_ligado: "som ligado",
    som_feedback_desligado: "som desligado",
  },
} as unknown as Mensagens

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

type Navegacao = NonNullable<React.ComponentProps<typeof CaixaSearchBar>["navegacaoResultados"]>

function navegacao(overrides: Partial<Navegacao> = {}): Navegacao {
  return {
    total: 3,
    ativo: 0,
    listboxId: "listbox-teste",
    optionId: (i: number) => `opcao-${i}`,
    onMover: vi.fn(),
    onConfirmar: vi.fn(),
    onFechar: vi.fn(),
    ...overrides,
  }
}

function renderBar(nav: Navegacao | null, onCodigoChange = vi.fn()) {
  flushSync(() => {
    root.render(
      <CaixaSearchBar
        m={mockMensagens}
        codigo="fone"
        onCodigoChange={onCodigoChange}
        onSubmit={vi.fn()}
        onNovoCupom={vi.fn()}
        buscando={false}
        carregandoRegras={false}
        somAtivo={false}
        onToggleSom={vi.fn()}
        navegacaoResultados={nav}
      />,
    )
  })
  const input = container.querySelector("input") as HTMLInputElement
  return { input, onCodigoChange }
}

function press(input: HTMLInputElement, key: string) {
  flushSync(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  })
}

describe("CaixaSearchBar — navegação do seletor de candidatos", () => {
  it("expõe o contrato ARIA de combobox quando há lista aberta", () => {
    const nav = navegacao({ ativo: 2 })
    const { input } = renderBar(nav)

    expect(input.getAttribute("role")).toBe("combobox")
    expect(input.getAttribute("aria-expanded")).toBe("true")
    expect(input.getAttribute("aria-controls")).toBe("listbox-teste")
    expect(input.getAttribute("aria-activedescendant")).toBe("opcao-2")
  })

  it("sem lista aberta não vira combobox (busca comum não anuncia popup)", () => {
    const { input } = renderBar(null)

    expect(input.getAttribute("role")).toBeNull()
    expect(input.getAttribute("aria-expanded")).toBeNull()
    expect(input.getAttribute("aria-activedescendant")).toBeNull()
  })

  it("setas movem a seleção sem sair do campo de busca", () => {
    const nav = navegacao()
    const { input } = renderBar(nav)
    input.focus()

    press(input, "ArrowDown")
    press(input, "ArrowUp")

    expect(nav.onMover).toHaveBeenCalledTimes(2)
    expect(nav.onMover).toHaveBeenNthCalledWith(1, 1)
    expect(nav.onMover).toHaveBeenNthCalledWith(2, -1)
    expect(document.activeElement).toBe(input)
  })

  it("Enter confirma o candidato destacado em vez de reenviar o termo ambíguo", () => {
    const nav = navegacao()
    const { input } = renderBar(nav)

    press(input, "Enter")

    expect(nav.onConfirmar).toHaveBeenCalledTimes(1)
  })

  it("Esc fecha a lista preservando o termo; só o Esc seguinte limpa o campo", () => {
    const nav = navegacao()
    const { input, onCodigoChange } = renderBar(nav)

    press(input, "Escape")
    expect(nav.onFechar).toHaveBeenCalledTimes(1)
    expect(onCodigoChange).not.toHaveBeenCalled()

    // Lista fechada: o Esc volta ao comportamento original de limpar a busca.
    const semLista = renderBar(null, onCodigoChange)
    press(semLista.input, "Escape")
    expect(onCodigoChange).toHaveBeenCalledWith("")
  })

  it("lista vazia não sequestra o Enter (evita travar a busca comum)", () => {
    const nav = navegacao({ total: 0 })
    const { input } = renderBar(nav)

    press(input, "Enter")

    expect(nav.onConfirmar).not.toHaveBeenCalled()
  })
})
