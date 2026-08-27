/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CaixaPdvOperadorTabs } from "@/app/caixa/CaixaPdvOperadorTabs"
import type { FormaPagamento } from "@/app/caixa/hooks/useCaixaPagamentos"
import type { Mensagens } from "@/i18n/getMessages"

const mockMensagens = {
  caixa: {
    pdv_tab_aria_pgto: "Pagamento",
    pdv_pgto_parcelas_titulo: "Formas de pagamento",
    pdv_pgto_auto_completar: "Auto-completar",
    aria_parcela_forma: "Forma da parcela {{n}}",
    aria_remover_parcela: "Remover parcela {{n}}",
    aria_parcela_valor: "Valor da parcela {{n}}",
    aria_adicionar_parcela: "Adicionar forma",
    pdv_pgto_adicionar_forma: "Adicionar forma",
    pdv_pgto_max_parcelas: "Máximo de formas",
    total_pagar: "Total a pagar",
    pdv_pgto_soma_parcelas: "Soma",
    pdv_pgto_troco_cliente: "Troco",
    pdv_pgto_diferenca: "Falta",
    pdv_pgto_excesso_sem_dinheiro: "Excesso sem troco",
  },
  gerente: {
    pagamento_dinheiro: "Dinheiro",
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

const noop = () => {}

function renderPanel(props: {
  forma: FormaPagamento
  valor: number
  total: number
}) {
  const { forma, valor, total } = props
  const soma = valor
  const diferenca = Math.round((soma - total) * 100) / 100
  flushSync(() =>
    root.render(
      <CaixaPdvOperadorTabs
        m={mockMensagens}
        pagamentos={[{ formaPagamento: forma, valor }]}
        totalLiquidoComGerente={total}
        somaParcelas={soma}
        diferenca={diferenca}
        podeAdicionarParcela
        formasDisponiveis={[forma]}
        onAdicionarParcela={noop}
        onRemoverParcela={noop}
        onAtualizarForma={noop}
        onAtualizarValor={noop}
        onAutoCompletar={noop}
        moedaPrefixo="R$"
        produtoPanel={<div />}
      />,
    ),
  )
}

function renderPanelDividido(props: {
  pagamentos: { formaPagamento: FormaPagamento; valor: number }[]
  total: number
}) {
  const { pagamentos, total } = props
  const soma = Math.round(pagamentos.reduce((acc, p) => acc + p.valor, 0) * 100) / 100
  const diferenca = Math.round((soma - total) * 100) / 100
  flushSync(() =>
    root.render(
      <CaixaPdvOperadorTabs
        m={mockMensagens}
        pagamentos={pagamentos}
        totalLiquidoComGerente={total}
        somaParcelas={soma}
        diferenca={diferenca}
        podeAdicionarParcela
        formasDisponiveis={["DINHEIRO", "PIX", "CARTAO_DEBITO", "CARTAO_CREDITO"]}
        onAdicionarParcela={noop}
        onRemoverParcela={noop}
        onAtualizarForma={noop}
        onAtualizarValor={noop}
        onAutoCompletar={noop}
        moedaPrefixo="R$"
        produtoPanel={<div />}
      />,
    ),
  )
}

describe("CaixaPdvOperadorTabs — divisão de pagamento, excesso sem dinheiro (regressão)", () => {
  it("excesso só em cartão/PIX: mostra alerta de ajuste, não 'Troco'", () => {
    renderPanelDividido({
      pagamentos: [
        { formaPagamento: "CARTAO_DEBITO", valor: 60 },
        { formaPagamento: "CARTAO_CREDITO", valor: 50 },
      ],
      total: 100,
    })
    const alerta = container.querySelector('[class*="text-destructive"]')
    expect(container.textContent).toContain("Excesso sem troco")
    expect(alerta).not.toBeNull()
    // Nunca deve rotular esse excesso como troco — só dinheiro gera troco.
    const trocoBlocos = Array.from(container.querySelectorAll("span")).filter(
      (el) => el.textContent === "Troco",
    )
    expect(trocoBlocos).toHaveLength(0)
  })

  it("excesso coberto por parcela DINHEIRO suficiente: mostra 'Troco' normalmente", () => {
    renderPanelDividido({
      pagamentos: [
        { formaPagamento: "CARTAO_DEBITO", valor: 40 },
        { formaPagamento: "DINHEIRO", valor: 70 },
      ],
      total: 100,
    })
    expect(container.textContent).toContain("Troco")
    expect(container.textContent).not.toContain("Excesso sem troco")
  })

  it("excesso maior que o dinheiro recebido: mostra alerta de ajuste, não 'Troco'", () => {
    renderPanelDividido({
      pagamentos: [
        { formaPagamento: "DINHEIRO", valor: 5 },
        { formaPagamento: "CARTAO_CREDITO", valor: 100 },
      ],
      total: 95,
    })
    expect(container.textContent).toContain("Excesso sem troco")
    const trocoBlocos = Array.from(container.querySelectorAll("span")).filter(
      (el) => el.textContent === "Troco",
    )
    expect(trocoBlocos).toHaveLength(0)
  })
})

describe("CaixaPdvOperadorTabs — troco inline (dinheiro, pagamento único)", () => {
  it("mostra o troco vivo quando recebido > total", () => {
    renderPanel({ forma: "DINHEIRO", valor: 100, total: 87.3 })
    const el = container.querySelector('[data-testid="caixa-troco-inline"]')
    expect(el).not.toBeNull()
    expect(el?.textContent).toContain("12,70")
  })

  it("troco 0,00 quando recebido = total", () => {
    renderPanel({ forma: "DINHEIRO", valor: 50, total: 50 })
    const el = container.querySelector('[data-testid="caixa-troco-inline"]')
    expect(el).not.toBeNull()
    expect(el?.textContent).toContain("0,00")
  })

  it("não mostra a leitura inline para PIX (não é dinheiro)", () => {
    renderPanel({ forma: "PIX", valor: 50, total: 50 })
    expect(container.querySelector('[data-testid="caixa-troco-inline"]')).toBeNull()
  })
})
