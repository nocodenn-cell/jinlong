import { describe, expect, it } from "vitest"
import { turnoNumeroDeCaixaId } from "@/app/caixa/caixaPdvTurnoDisplay"

describe("turnoNumeroDeCaixaId", () => {
  it("é estável e dentro do intervalo esperado", () => {
    const id = "a0000001-0000-4000-8000-0000000000ca"
    expect(turnoNumeroDeCaixaId(id)).toBe(turnoNumeroDeCaixaId(id))
    const n = turnoNumeroDeCaixaId(id)
    expect(n).toBeGreaterThanOrEqual(1)
    expect(n).toBeLessThanOrEqual(99_000)
  })
})
