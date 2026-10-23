/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CaixaPdvOperadorTabs } from "@/app/caixa/CaixaPdvOperadorTabs"
import type { FormaPagamento } from "@/app/caixa/hooks/useCaixaPagamentos"
import { getMessages } from "@/i18n/getMessages"

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

const noop = () => {}

function render(
  pagamentos: { formaPagamento: FormaPagamento; valor: number; parcelas?: number }[],
  total: number,
  locale: "pt" | "zh" = "pt",
) {
  const soma = Math.round(pagamentos.reduce((acc, p) => acc + p.valor, 0) * 100) / 100
  flushSync(() =>
    root.render(
      <CaixaPdvOperadorTabs
        m={getMessages(locale)}
        pagamentos={pagamentos}
        totalLiquidoComGerente={total}
        somaParcelas={soma}
        diferenca={Math.round((soma - total) * 100) / 100}
        podeAdicionarParcela
        formasDisponiveis={["DINHEIRO", "PIX", "CARTAO_DEBITO", "CARTAO_CREDITO"]}
        onAdicionarParcela={noop}
        onRemoverParcela={noop}
        onAtualizarForma={noop}
        onAtualizarValor={noop}
        onAtualizarParcelas={noop}
        onAutoCompletar={noop}
        moedaPrefixo="R$"
        produtoPanel={<div />}
      />,
    ),
  )
}

const opcoes = (select: Element | null) =>
  Array.from(select?.querySelectorAll("option") ?? []).map((o) => o.textContent ?? "")

describe("CaixaPdvOperadorTabs — seletor de parcelas do crédito", () => {
  it("forma única: 1x à vista, valores reais e nenhum placeholder literal", () => {
    render([{ formaPagamento: "CARTAO_CREDITO", valor: 100 }], 100)
    const select = container.querySelector('[data-testid="caixa-parcelas-credito"]')
    const textos = opcoes(select)
    expect(textos).toHaveLength(24)
    expect(textos[0]).toBe("1x — À vista")
    expect(textos[1]).toBe("2x de R$ 50,00")
    expect(textos[2]).toBe("3x de R$ 33,33 (última R$ 33,34)")
    expect(textos[23]).toBe("24x de R$ 4,16 (última R$ 4,32)")
    expect(new Set(textos).size).toBe(24)
    expect(container.textContent).not.toMatch(/\{n\}|\{\{/)
    expect(select?.getAttribute("aria-label")).toBe("Parcelas do crédito da forma 1")
    // 1x: sem legenda de resumo
    expect(container.querySelector('[data-testid="caixa-parcelas-resumo"]')).toBeNull()
  })

  it("forma única em 3x: legenda com total e número de parcelas", () => {
    render([{ formaPagamento: "CARTAO_CREDITO", valor: 100, parcelas: 3 }], 100)
    const resumo = container.querySelector('[data-testid="caixa-parcelas-resumo"]')
    expect(resumo?.textContent).toBe("Total R$ 100,00 em 3x · 3x de R$ 33,33 (última R$ 33,34)")
  })

  it("中文: rótulos em chinês, sem placeholder", () => {
    render([{ formaPagamento: "CARTAO_CREDITO", valor: 100, parcelas: 2 }], 100, "zh")
    const textos = opcoes(container.querySelector('[data-testid="caixa-parcelas-credito"]'))
    expect(textos[0]).toBe("1 期 — 一次付清")
    expect(textos[1]).toBe("2 期，每期 R$ 50,00")
    expect(container.querySelector('[data-testid="caixa-parcelas-resumo"]')?.textContent).toContain(
      "合计 R$ 100,00，分 2 期",
    )
    expect(container.textContent).not.toMatch(/\{n\}|\{\{/)
  })

  it("forma única que não é crédito: sem seletor nem legenda", () => {
    render([{ formaPagamento: "PIX", valor: 100 }], 100)
    expect(container.querySelector('[data-testid="caixa-parcelas-credito"]')).toBeNull()
    expect(container.querySelector('[data-testid="caixa-parcelas-resumo"]')).toBeNull()
  })

  it("modo dividido: rótulos calculados sobre o valor da linha do crédito", () => {
    render(
      [
        { formaPagamento: "DINHEIRO", valor: 40 },
        { formaPagamento: "CARTAO_CREDITO", valor: 60, parcelas: 6 },
      ],
      100,
    )
    const selects = container.querySelectorAll('[data-testid="caixa-parcelas-credito"]')
    expect(selects).toHaveLength(1)
    const textos = opcoes(selects[0])
    expect(textos[1]).toBe("2x de R$ 30,00")
    expect(textos[5]).toBe("6x de R$ 10,00")
    expect(textos[6]).toBe("7x de R$ 8,57 (última R$ 8,58)")
    expect(selects[0].getAttribute("aria-label")).toBe("Parcelas do crédito da forma 2")
    expect(container.textContent).not.toMatch(/\{n\}|\{\{/)
  })

  it("modo dividido com valor do crédito ainda 0: só o número de parcelas", () => {
    render(
      [
        { formaPagamento: "DINHEIRO", valor: 100 },
        { formaPagamento: "CARTAO_CREDITO", valor: 0 },
      ],
      100,
    )
    const textos = opcoes(container.querySelector('[data-testid="caixa-parcelas-credito"]'))
    expect(textos[0]).toBe("1x — À vista")
    expect(textos[2]).toBe("3x")
  })
})
