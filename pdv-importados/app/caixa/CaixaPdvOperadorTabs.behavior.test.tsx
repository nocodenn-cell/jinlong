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
    pdv_tabs_lista_aria: "Abas do operador",
    pdv_tab_produto: "Produto",
    pdv_tab_cliente: "Cliente",
    pdv_tab_pgto: "Pgto",
    pdv_tab_aria_produto: "Produto",
    pdv_tab_aria_cliente: "Cliente",
    pdv_tab_aria_pgto: "Pagamento",
    pdv_cliente_cupom_titulo: "Cliente no cupom",
    pdv_cliente_sem_cadastro_desc: "Sem cliente vinculado.",
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
        activeTab="pgto"
        onActiveTabChange={noop}
        clienteNome={null}
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
