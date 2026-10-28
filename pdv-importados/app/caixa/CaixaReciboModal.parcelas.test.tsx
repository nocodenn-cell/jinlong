/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getMessages } from "@/i18n/getMessages"
import { CaixaReciboModal } from "@/app/caixa/CaixaReciboModal"
import type { ReciboVenda } from "@/lib/caixa/reciboTypes"
import type { UseThermalPrinterReturn } from "@/hooks/useThermalPrinter"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const venda: ReciboVenda = {
  vendaId: "venda-parcelas-0001",
  data: new Date("2026-10-23T12:00:00Z"),
  clienteNome: null,
  itens: [{ nome: "Produto teste", quantidade: 1, precoUnitario: 100, precoOriginal: 100, tipoPreco: "VAREJO" }],
  pagamentos: [{ formaPagamento: "CARTAO_CREDITO", valor: 100, parcelas: 3 }],
  totalBruto: 100,
  totalDesconto: 0,
  totalLiquidoComGerente: 100,
  descontoGerentePercentual: 0,
  valorDescontoGerente: 0,
  moeda: "R$",
}

const thermal: UseThermalPrinterReturn = {
  supported: false,
  status: "idle",
  deviceInfo: null,
  savedInfo: null,
  errorMsg: null,
  connect: vi.fn(async () => {}),
  printRecibo: vi.fn(async () => {}),
  abrirGaveta: vi.fn(async () => true),
  disconnect: vi.fn(async () => {}),
}

describe("CaixaReciboModal — crédito parcelado", () => {
  it.each(["pt", "zh"] as const)("%s: mostra a forma com o número de parcelas, sem placeholder", (locale) => {
    const m = getMessages(locale)
    act(() => {
      root.render(<CaixaReciboModal venda={venda} m={m} onClose={() => {}} thermal={thermal} />)
    })
    const sufixo = m.caixa.recibo.parcelas_n.replace("{{n}}", "3")
    expect(container.textContent).toContain(`${m.caixa.pdv_metodo_pagamento_credito} ${sufixo}`)
    expect(container.textContent).not.toMatch(/\{n\}|\{\{/)
  })
})
