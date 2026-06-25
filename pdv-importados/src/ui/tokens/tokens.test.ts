import { describe, it, expect } from "vitest"
import { colors, primitiveHex, spacing, radius, typography, shadows } from "./index"

/**
 * Tokens são a fonte de verdade visual em TS. Estes testes travam o contrato:
 * tokens semânticos resolvem via `var(--token)` (tema em runtime) e os hex
 * primitivos espelham `styles/tokens/base.css`.
 */
describe("ui tokens", () => {
  it("expõe cores semânticas como referências var()", () => {
    expect(colors.success[500]).toBe("var(--color-success-500)")
    expect(colors.danger[500]).toBe("var(--color-danger-500)")
    expect(colors.brand.primary).toBe("var(--color-brand-primary)")
    expect(colors.background.primary).toBe("var(--color-background-primary)")
  })

  it("hex primitivos espelham base.css", () => {
    expect(primitiveHex.gold[400]).toBe("#fbbf24")
    expect(primitiveHex.jade[500]).toBe("#10b981")
    expect(primitiveHex.imperialRed[600]).toBe("#dc2626")
    expect(primitiveHex.night[950]).toBe("#020617")
  })

  it("espaçamento, radius, tipografia e sombras são var()", () => {
    expect(spacing.layout.md).toBe("var(--space-layout-md)")
    expect(radius.card).toBe("var(--radius-card)")
    expect(typography.size.heading.lg).toBe("var(--font-size-heading-lg)")
    expect(shadows.modal).toBe("var(--shadow-modal)")
  })

  it("nenhum token semântico contém hex literal", () => {
    const flat = JSON.stringify({ colors, spacing, radius, typography, shadows })
    expect(flat).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })
})
