/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CaixaCartList } from "@/app/caixa/CaixaCartList"
import type { ItemCarrinhoComPreco } from "@/stores/carrinhoStore"
import type { Mensagens } from "@/i18n/getMessages"

/**
 * Estoque visível na linha do carrinho.
 *
 * O dado já vinha do servidor em `metaPdv` desde a leitura, mas só aparecia num
 * toast passageiro — some antes da decisão que ele apoia (aumentar quantidade).
 * Estes testes travam a permanência e a graduação do sinal.
 *
 * O componente NÃO bloqueia venda: a validação de estoque continua sendo do
 * servidor, na finalização. Aqui é antecipação de informação, não regra.
 */

const mockMensagens = {
  caixa: {
    col_produto: "Produto",
    col_qtde: "Qtde",
    col_unit: "Unit.",
    col_total: "Total",
    col_tipo: "Tipo",
    remover: "remover",
    aria_qtde_item: "Quantidade — {{nome}}",
    aria_qtde_aumentar: "Aumentar — {{nome}}",
    aria_qtde_diminuir: "Diminuir — {{nome}}",
    id_label: "ID",
    moeda_prefixo: "R$",
    cart_estoque_label: "Estoque",
    cart_estoque_sem_controle: "sem controle",
    cart_estoque_insuficiente: "Estoque insuficiente ({{disponivel}} disponível)",
    origem_china_manual: "China (manual)",
    origem_brasil_nf: "Brasil",
    origem_brasil_sem_nf: "Brasil",
  },
  relatorios: { atacado: "Atacado", varejo: "Varejo", manual: "Manual", promocao: "Promoção" },
} as unknown as Mensagens

function item(
  metaPdv: Record<string, unknown> | undefined,
  quantidade = 1,
): ItemCarrinhoComPreco {
  return {
    id: "linha-1",
    produtoId: "11111111-1111-1111-1111-111111111111",
    nome: "Fone Bluetooth Preto",
    quantidade,
    precoUnitario: 49.9,
    precoOriginal: 49.9,
    metaPdv,
    resultado: {
      precoUnitario: 49.9,
      precoOriginal: 49.9,
      descontoUnitario: 0,
      tipoPreco: "VAREJO",
    },
  } as ItemCarrinhoComPreco
}

const META_BASE = { origem: "china_manual", tem_nf: false, observacao: null }

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

function render(itens: ItemCarrinhoComPreco[]) {
  flushSync(() => {
    root.render(
      <CaixaCartList
        m={mockMensagens}
        idioma="pt"
        itens={itens}
        moeda="R$"
        onAlterarQuantidade={vi.fn()}
        onRemover={vi.fn()}
      />,
    )
  })
  // O componente renderiza desktop e mobile ao mesmo tempo (alternados por CSS),
  // então o texto aparece duas vezes — irrelevante para o que se afirma aqui.
  return container.textContent ?? ""
}

describe("CaixaCartList — estoque na linha", () => {
  it("mostra o saldo quando o estoque é folgado", () => {
    const texto = render([item({ ...META_BASE, estoque_atual: 42, estoque_minimo: 3 }, 2)])

    expect(texto).toContain("Estoque 42")
    expect(texto).not.toContain("insuficiente")
  })

  it("alerta quando a quantidade da linha excede o estoque disponível", () => {
    const texto = render([item({ ...META_BASE, estoque_atual: 3, estoque_minimo: 1 }, 12)])

    expect(texto).toContain("Estoque insuficiente (3 disponível)")
  })

  it("insuficiência tem precedência sobre estoque no mínimo", () => {
    // Ambas as condições verdadeiras: o operador precisa ver a que bloqueia a venda.
    const texto = render([item({ ...META_BASE, estoque_atual: 2, estoque_minimo: 5 }, 9)])

    expect(texto).toContain("Estoque insuficiente (2 disponível)")
  })

  it("sinaliza estoque no ou abaixo do mínimo quando a quantidade ainda cabe", () => {
    const texto = render([item({ ...META_BASE, estoque_atual: 3, estoque_minimo: 5 }, 1)])

    expect(texto).toContain("Estoque 3")
    expect(texto).not.toContain("insuficiente")
  })

  it("produto sem linha de estoque não inventa número", () => {
    const texto = render([item({ ...META_BASE, estoque_atual: null, estoque_minimo: null }, 1)])

    expect(texto).not.toContain("Estoque")
  })

  it("item sem metaPdv (carrinho legado persistido) não quebra a linha", () => {
    const texto = render([item(undefined, 1)])

    expect(texto).toContain("Fone Bluetooth Preto")
    expect(texto).not.toContain("Estoque")
  })
})
