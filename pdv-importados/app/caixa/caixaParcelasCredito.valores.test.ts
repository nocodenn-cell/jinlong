import { describe, expect, it } from "vitest"
import { getMessages } from "@/i18n/getMessages"
import { MAX_PARCELAS_CREDITO } from "@/app/caixa/finalizarVendaValidation"
import { rotuloOpcaoParcelasCredito, valoresParcelasCredito } from "@/app/caixa/caixaParcelasCredito"

const somaCentavos = (total: number, n: number) => {
  const { parcela, ultima } = valoresParcelasCredito(total, n)
  return Math.round(parcela * 100) * (n - 1) + Math.round(ultima * 100)
}

describe("valoresParcelasCredito — mesma regra do financeiro (trunc + última fecha)", () => {
  it("100 em 3x → 33,33 + 33,33 + 33,34", () => {
    expect(valoresParcelasCredito(100, 3)).toEqual({ parcela: 33.33, ultima: 33.34 })
  })
  it("divisão exata: parcela e última iguais", () => {
    expect(valoresParcelasCredito(100, 4)).toEqual({ parcela: 25, ultima: 25 })
    expect(valoresParcelasCredito(100, 1)).toEqual({ parcela: 100, ultima: 100 })
  })
  it("a soma bate exatamente com o total, de 1x a 24x", () => {
    for (const total of [0.01, 1, 9.99, 100, 123.45, 1999.9, 3333.33]) {
      for (let n = 1; n <= MAX_PARCELAS_CREDITO; n++) {
        expect(somaCentavos(total, n), `${total} em ${n}x`).toBe(Math.round(total * 100))
      }
    }
  })
  it("total 0 (ou inválido) não gera valores negativos", () => {
    expect(valoresParcelasCredito(0, 3)).toEqual({ parcela: 0, ultima: 0 })
    expect(valoresParcelasCredito(Number.NaN, 3)).toEqual({ parcela: 0, ultima: 0 })
    expect(valoresParcelasCredito(-5, 2)).toEqual({ parcela: 0, ultima: 0 })
  })
})

describe("rotuloOpcaoParcelasCredito — rótulos do seletor (pt/zh)", () => {
  const pt = getMessages("pt").caixa
  const zh = getMessages("zh").caixa

  it("PT: 1x à vista, 2x, 3x com última, 24x", () => {
    expect(rotuloOpcaoParcelasCredito(1, 100, pt, "R$")).toBe("1x — À vista")
    expect(rotuloOpcaoParcelasCredito(2, 100, pt, "R$")).toBe("2x de R$ 50,00")
    expect(rotuloOpcaoParcelasCredito(3, 100, pt, "R$")).toBe("3x de R$ 33,33 (última R$ 33,34)")
    expect(rotuloOpcaoParcelasCredito(24, 2400, pt, "R$")).toBe("24x de R$ 100,00")
  })
  it("中文: 期数 e valor por parcela", () => {
    expect(rotuloOpcaoParcelasCredito(1, 100, zh, "R$")).toBe("1 期 — 一次付清")
    expect(rotuloOpcaoParcelasCredito(2, 100, zh, "R$")).toBe("2 期，每期 R$ 50,00")
    expect(rotuloOpcaoParcelasCredito(3, 100, zh, "R$")).toBe("3 期，每期 R$ 33,33（末期 R$ 33,34）")
  })
  it("valor ainda 0: mostra só o número de parcelas", () => {
    expect(rotuloOpcaoParcelasCredito(3, 0, pt, "R$")).toBe("3x")
    expect(rotuloOpcaoParcelasCredito(3, 0, zh, "R$")).toBe("3 期")
  })
  it("nenhum rótulo de 1x a 24x tem placeholder literal", () => {
    for (const c of [pt, zh]) {
      const rotulos = Array.from({ length: MAX_PARCELAS_CREDITO }, (_, i) =>
        rotuloOpcaoParcelasCredito(i + 1, 157.9, c, "R$"),
      )
      expect(new Set(rotulos).size).toBe(MAX_PARCELAS_CREDITO)
      for (const r of rotulos) expect(r).not.toMatch(/[{}]/)
    }
  })
})
