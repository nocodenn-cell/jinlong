/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CaixaCartList } from "@/app/caixa/CaixaCartList"
import type { ItemCarrinhoComPreco } from "@/stores/carrinhoStore"
import type { Mensagens } from "@/i18n/getMessages"

function buildItem(overrides: Partial<ItemCarrinhoComPreco> = {}): ItemCarrinhoComPreco {
  const precoUnitario = overrides.precoUnitario ?? 15.5
  const quantidade = overrides.quantidade ?? 1
  return {
    id: overrides.id ?? "linha-1",
    produtoId: overrides.produtoId ?? "11111111-1111-1111-1111-111111111111",
    nome: overrides.nome ?? "Pacote snacks picantes",
    quantidade,
    precoUnitario,
    precoOriginal: overrides.precoOriginal ?? precoUnitario,
    resultado: overrides.resultado ?? {
      precoUnitario,
      precoOriginal: precoUnitario,
      descontoUnitario: 0,
      tipoPreco: "VAREJO",
    },
  }
}

const mockMensagens = {
  caixa: {
    col_produto: "Produto",
    col_qtde: "Qtde",
    col_unit: "Unit.",
    col_total: "Total",
    col_tipo: "Tipo",
    remover: "remover",
    aria_qtde_item: "Quantidade — {{nome}}",
    aria_qtde_aumentar: "Aumentar 1 unidade — {{nome}}",
    aria_qtde_diminuir: "Diminuir 1 unidade — {{nome}}",
    id_label: "ID",
    badge_nf: "NF",
    badge_sem_nf: "Sem NF",
    empty_guardiao: "",
    empty_cta_scan: "",
    empty_cta_type_enter: "",
    empty_shortcut_focus: "",
    finalizar_venda: "",
    adicionar_enter: "",
  },
  relatorios: {
    varejo: "Varejo",
    atacado: "Atacado",
    manual: "Manual",
  },
} as unknown as Mensagens

function findButtonByAriaPrefix(container: HTMLElement, prefix: string): HTMLButtonElement | null {
  const all = container.querySelectorAll("button")
  for (const btn of Array.from(all)) {
    const label = btn.getAttribute("aria-label") ?? ""
    if (label.startsWith(prefix)) return btn as HTMLButtonElement
  }
  return null
}

function renderList(
  root: Root,
  itens: ItemCarrinhoComPreco[],
  onAlterarQuantidade: (id: string, q: number) => void,
  onRemover: (id: string) => void,
) {
  flushSync(() => {
    root.render(
      <CaixaCartList
        m={mockMensagens}
        idioma="pt"
        itens={itens}
        moeda="R$"
        onAlterarQuantidade={onAlterarQuantidade}
        onRemover={onRemover}
      />,
    )
  })
}

describe("CaixaCartList — stepper de quantidade", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    flushSync(() => {
      root.unmount()
    })
    container.remove()
  })

  it("clicar no '+' chama onAlterarQuantidade com quantidade + 1", () => {
    const onAlterarQuantidade = vi.fn()
    const onRemover = vi.fn()
    const item = buildItem({ quantidade: 2 })

    renderList(root, [item], onAlterarQuantidade, onRemover)

    const btnAumentar = findButtonByAriaPrefix(container, "Aumentar 1 unidade")
    expect(btnAumentar).not.toBeNull()

    flushSync(() => {
      btnAumentar!.click()
    })

    expect(onAlterarQuantidade).toHaveBeenCalledWith(item.id, 3)
    expect(onRemover).not.toHaveBeenCalled()
  })

  it("clicar no '−' com quantidade > 1 decrementa em 1", () => {
    const onAlterarQuantidade = vi.fn()
    const onRemover = vi.fn()
    const item = buildItem({ quantidade: 4 })

    renderList(root, [item], onAlterarQuantidade, onRemover)

    const btnDiminuir = findButtonByAriaPrefix(container, "Diminuir 1 unidade")
    expect(btnDiminuir).not.toBeNull()

    flushSync(() => {
      btnDiminuir!.click()
    })

    expect(onAlterarQuantidade).toHaveBeenCalledWith(item.id, 3)
    expect(onRemover).not.toHaveBeenCalled()
  })

  it("clicar no '−' com quantidade 1 remove o item", () => {
    const onAlterarQuantidade = vi.fn()
    const onRemover = vi.fn()
    const item = buildItem({ quantidade: 1 })

    renderList(root, [item], onAlterarQuantidade, onRemover)

    const btnDiminuir = findButtonByAriaPrefix(container, "Diminuir 1 unidade")
    expect(btnDiminuir).not.toBeNull()

    flushSync(() => {
      btnDiminuir!.click()
    })

    expect(onRemover).toHaveBeenCalledWith(item.id)
    expect(onAlterarQuantidade).not.toHaveBeenCalled()
  })
})
