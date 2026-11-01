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
    sku: overrides.sku,
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
    qtd_formato_invalido: "Quantidade inválida. Use números, com vírgula para decimais. Ex.: 0,500",
    aria_qtde_aumentar: "Aumentar 1 unidade — {{nome}}",
    aria_qtde_diminuir: "Diminuir 1 unidade — {{nome}}",
    sku_label: "Código",
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

  it("campo de quantidade aceita fração em pt-BR (texto, teclado decimal)", () => {
    const item = buildItem({ quantidade: 0.125 })

    renderList(root, [item], vi.fn(), vi.fn())

    const input = quantidadeInput(container)
    expect(input.getAttribute("type")).toBe("text")
    expect(input.getAttribute("inputmode")).toBe("decimal")
    expect(input.value).toBe("0,125")
  })

  it("digitar '0,' (estado intermediário) não altera a quantidade nem remove a linha", () => {
    const onAlterarQuantidade = vi.fn()
    const onRemover = vi.fn()
    renderList(root, [buildItem({ quantidade: 2 })], onAlterarQuantidade, onRemover)

    const input = quantidadeInput(container)
    digitar(input, "0,")
    blur(input)

    expect(onRemover).not.toHaveBeenCalled()
    expect(onAlterarQuantidade).not.toHaveBeenCalled()
  })

  it("digitar 0,5 e confirmar com Enter vende fração (0,5 kg)", () => {
    const onAlterarQuantidade = vi.fn()
    renderList(root, [buildItem({ id: "l1", quantidade: 2 })], onAlterarQuantidade, vi.fn())

    const input = quantidadeInput(container)
    digitar(input, "0,5")
    tecla(input, "Enter")

    expect(onAlterarQuantidade).toHaveBeenCalledTimes(1)
    expect(onAlterarQuantidade).toHaveBeenCalledWith("l1", 0.5)
  })

  it("0,500 é confirmado como 0,5 (até 3 casas, sem arredondar)", () => {
    const onAlterarQuantidade = vi.fn()
    renderList(root, [buildItem({ id: "l1", quantidade: 2 })], onAlterarQuantidade, vi.fn())

    const input = quantidadeInput(container)
    digitar(input, "0,500")
    blur(input)

    expect(onAlterarQuantidade).toHaveBeenCalledWith("l1", 0.5)
  })

  it("entrada inválida (10.50) não é confirmada e mostra o motivo", () => {
    const onAlterarQuantidade = vi.fn()
    renderList(root, [buildItem({ quantidade: 2 })], onAlterarQuantidade, vi.fn())

    const input = quantidadeInput(container)
    digitar(input, "10.50")
    blur(input)

    expect(onAlterarQuantidade).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      mockMensagens.caixa.qtd_formato_invalido,
    )
  })

  it("apagar o campo e sair não remove a linha (mantém rascunho para correção)", () => {
    const onAlterarQuantidade = vi.fn()
    const onRemover = vi.fn()
    renderList(root, [buildItem({ quantidade: 2 })], onAlterarQuantidade, onRemover)

    const input = quantidadeInput(container)
    digitar(input, "")
    blur(input)

    expect(onRemover).not.toHaveBeenCalled()
    expect(onAlterarQuantidade).not.toHaveBeenCalled()
  })

  it("0 confirmado explicitamente continua removendo a linha (regra existente)", () => {
    const onAlterarQuantidade = vi.fn()
    renderList(root, [buildItem({ id: "l1", quantidade: 2 })], onAlterarQuantidade, vi.fn())

    const input = quantidadeInput(container)
    digitar(input, "0")
    tecla(input, "Enter")

    expect(onAlterarQuantidade).toHaveBeenCalledWith("l1", 0)
  })
})

function quantidadeInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[aria-label^="Quantidade"]') as HTMLInputElement | null
  if (!input) throw new Error("campo de quantidade não encontrado")
  return input
}

function digitar(input: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  flushSync(() => {
    setter.call(input, valor)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

function blur(input: HTMLInputElement) {
  flushSync(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
  })
}

function tecla(input: HTMLInputElement, key: string) {
  flushSync(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
  })
}

// Onda 2 · Bloco 2 — a linha do carrinho precisa preservar identificação
// suficiente pra distinguir produtos semelhantes (não só o ID truncado).
describe("CaixaCartList — diferenciador do produto (Onda 2 · Bloco 2)", () => {
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

  it("mostra o código (SKU/barcode) quando existir — não mais o ID truncado do produto", () => {
    const item = buildItem({ nome: "Cadeira Vermelha Grande", sku: "CAD-VERM-G" })
    renderList(root, [item], vi.fn(), vi.fn())

    expect(container.textContent).toContain("CAD-VERM-G")
    // Regressão: o ID interno do produto não deve mais vazar pra tela.
    expect(container.textContent).not.toContain(item.produtoId.slice(0, 8))
  })

  it("sem código cadastrado, omite a linha em vez de mostrar um ID sem sentido operacional", () => {
    const item = buildItem({ nome: "Produto sem código" })
    renderList(root, [item], vi.fn(), vi.fn())

    expect(container.textContent).not.toContain("Código:")
    expect(container.textContent).not.toContain(item.produtoId.slice(0, 8))
  })

  it("dois produtos com nomes parecidos mostram códigos diferentes na lista", () => {
    const a = buildItem({ id: "l1", produtoId: "p-verm", nome: "Cadeira Vermelha", sku: "CAD-VERM" })
    const b = buildItem({ id: "l2", produtoId: "p-vg", nome: "Cadeira Vermelha Grande", sku: "CAD-VERM-G" })
    renderList(root, [a, b], vi.fn(), vi.fn())

    expect(container.textContent).toContain("CAD-VERM")
    expect(container.textContent).toContain("CAD-VERM-G")
  })
})
