import { describe, expect, it } from "vitest"
import { getMessages } from "@/i18n/getMessages"
import { buildReciboLabels, rotuloPagamentoRecibo, type ReciboVenda } from "@/lib/caixa/reciboTypes"
import { buildReciboEscPos } from "@/lib/thermal-printer/escpos"

const pt = buildReciboLabels(getMessages("pt"))
const zh = buildReciboLabels(getMessages("zh"))

const venda: ReciboVenda = {
  vendaId: "venda-parcelas-0001",
  data: new Date("2026-10-23T12:00:00Z"),
  clienteNome: null,
  itens: [{ nome: "Produto teste", quantidade: 1, precoUnitario: 100, precoOriginal: 100, tipoPreco: "VAREJO" }],
  pagamentos: [
    { formaPagamento: "DINHEIRO", valor: 40 },
    { formaPagamento: "CARTAO_CREDITO", valor: 60, parcelas: 3 },
  ],
  totalBruto: 100,
  totalDesconto: 0,
  totalLiquidoComGerente: 100,
  descontoGerentePercentual: 0,
  valorDescontoGerente: 0,
  moeda: "R$",
}

const decode = (b: Uint8Array) => Array.from(b).map((c) => String.fromCharCode(c)).join("")

describe("cupom — parcelas do crédito", () => {
  it("crédito 3x ganha o sufixo; 1x, sem parcelas e outras formas não", () => {
    expect(rotuloPagamentoRecibo({ formaPagamento: "CARTAO_CREDITO", valor: 60, parcelas: 3 }, pt)).toBe(
      `${pt.formas.CARTAO_CREDITO} 3x`,
    )
    expect(rotuloPagamentoRecibo({ formaPagamento: "CARTAO_CREDITO", valor: 60, parcelas: 1 }, pt)).toBe(
      pt.formas.CARTAO_CREDITO,
    )
    expect(rotuloPagamentoRecibo({ formaPagamento: "CARTAO_CREDITO", valor: 60 }, pt)).toBe(pt.formas.CARTAO_CREDITO)
    expect(rotuloPagamentoRecibo({ formaPagamento: "PIX", valor: 60, parcelas: 3 }, pt)).toBe(pt.formas.PIX)
  })

  it("中文: sufixo em 期", () => {
    expect(rotuloPagamentoRecibo({ formaPagamento: "CARTAO_CREDITO", valor: 60, parcelas: 12 }, zh)).toBe(
      `${zh.formas.CARTAO_CREDITO} 12 期`,
    )
  })

  it("ESC/POS: linha do crédito com 3x e sem placeholder", () => {
    const texto = decode(buildReciboEscPos(venda, pt))
    expect(texto).toContain("3x")
    expect(texto).not.toMatch(/\{n\}|\{\{/)
  })
})
