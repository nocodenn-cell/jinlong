import { describe, expect, it } from 'vitest'
import { formatBRL, formatDecimal2, formatNumberLocale, formatDecimalPlaces, formatDecimalBRL, parseBRL } from './money'

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

describe('formatDecimalBRL', () => {
  it('formata com 2 casas decimais e separadores pt-BR', () => {
    expect(formatDecimalBRL(25.9)).toBe('25,90')
    expect(formatDecimalBRL(1234.56)).toBe('1.234,56')
    expect(formatDecimalBRL(0)).toBe('0,00')
  })

  it('trunca para exatamente 2 casas decimais', () => {
    expect(formatDecimalBRL(25.999)).toBe('26,00')
    expect(formatDecimalBRL(25.001)).toBe('25,00')
  })

  it('trata valores não-finitos como 0', () => {
    expect(formatDecimalBRL(NaN)).toBe('0,00')
    expect(formatDecimalBRL(Infinity)).toBe('0,00')
  })
})

describe('parseBRL', () => {
  it('converte formatos BRL para número', () => {
    expect(parseBRL('25,90')).toBe(25.9)
    expect(parseBRL('1.234,56')).toBe(1234.56)
    expect(parseBRL('0,00')).toBe(0)
  })

  it('retorna null para strings inválidas', () => {
    expect(parseBRL('')).toBeNull()
    expect(parseBRL('  ')).toBeNull()
    expect(parseBRL('abc')).toBeNull()
  })
})
