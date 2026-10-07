import { describe, expect, it } from "vitest"
import { limiteDescontoOperador, validarDescontoManual } from "./descontoManualPolicy"
const item = { id: "a", produtoId: "a", nome: "Teste", quantidade: 2, precoOriginal: 100, precoUnitario: 100 }
describe("desconto manual respeita alçada e piso", () => {
  it("aceita dentro da alçada", () => {
    expect(validarDescontoManual([item], "a", 10, 10)).toBe(true)
    expect(validarDescontoManual([item], "a", 11, 10)).toBe(false)
  })
  it("soma descontos já aplicados e recusa piso", () => {
    const manual = { ...item, precoUnitario: 95, resultado: { precoOriginal: 100, precoUnitario: 95, descontoUnitario: 5, tipoPreco: "MANUAL" as const } }
    expect(validarDescontoManual([manual], "a", 6, 10)).toBe(false)
    expect(validarDescontoManual([{ ...item, precoMinimo: 98 }], "a", 5, 10)).toBe(false)
  })
  it("respeita configuração zero e valores inválidos", () => {
    expect(limiteDescontoOperador("0")).toBe(0)
    expect(limiteDescontoOperador("inválido")).toBe(10)
    expect(validarDescontoManual([item], "a", NaN, 10)).toBe(false)
    expect(validarDescontoManual([item], "a", -1, 10)).toBe(false)
  })
})
