import { describe, expect, it } from 'vitest'
import { formatarBRL } from './formatarMoeda'

const n = (s: string) => s.replace(/\u00a0/g, ' ')

describe('formatarBRL', () => {
  it('usa vírgula decimal e R$', () => {
    expect(n(formatarBRL(12.5))).toBe('R$ 12,50')
  })
  it('agrupa milhar com ponto', () => {
    expect(n(formatarBRL(1234.56))).toBe('R$ 1.234,56')
  })
  it('zero e valor não finito', () => {
    expect(n(formatarBRL(0))).toBe('R$ 0,00')
    expect(n(formatarBRL(Number.NaN))).toBe('R$ 0,00')
  })
  it('negativo', () => {
    expect(n(formatarBRL(-3))).toMatch(/^-R\$ 3,00$/)
  })
})
