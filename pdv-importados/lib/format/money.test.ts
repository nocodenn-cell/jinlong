import { describe, expect, it } from 'vitest'
import { formatBRL, formatDecimal2, formatNumberLocale, formatDecimalPlaces } from './money'

describe('money formatters — defensivo contra valores não-finitos', () => {
  it('formata valores válidos normalmente', () => {
    expect(formatBRL(1234.5)).toContain('1.234,50')
    expect(formatDecimal2(10)).toBe('10,00')
    expect(formatNumberLocale(1000)).toBe('1.000')
    expect(formatDecimalPlaces(1.23456, 3)).toBe('1.235')
  })

  it('nunca renderiza "NaN" para NaN/Infinity', () => {
    for (const fn of [formatBRL, formatDecimal2, formatNumberLocale]) {
      expect(fn(NaN)).not.toContain('NaN')
      expect(fn(Infinity)).not.toContain('Infinity')
      expect(fn(-Infinity)).not.toContain('Infinity')
    }
    expect(formatDecimalPlaces(NaN, 2)).toBe('0.00')
  })

  it('não quebra com null/undefined (coerção para 0)', () => {
    // Entradas inválidas podem chegar em runtime apesar do tipo `number`.
    expect(() => formatBRL(undefined as unknown as number)).not.toThrow()
    expect(() => formatBRL(null as unknown as number)).not.toThrow()
    expect(formatDecimal2(undefined as unknown as number)).toBe('0,00')
    expect(formatNumberLocale(null as unknown as number)).toBe('0')
  })
})
