import { describe, expect, it } from 'vitest'
import { formatBRL, formatDecimal2, formatDecimalPlaces, formatNumberLocale } from './money'

describe('formatBRL', () => {
  it('formats positive value as BRL currency', () => {
    const result = formatBRL(1234.56)
    expect(result).toContain('1.234,56')
  })

  it('formats zero', () => {
    const result = formatBRL(0)
    expect(result).toContain('0,00')
  })

  it('formats negative value', () => {
    const result = formatBRL(-50.1)
    expect(result).toContain('50,10')
  })
})

describe('formatDecimal2', () => {
  it('formats with 2 fraction digits', () => {
    expect(formatDecimal2(1234.5)).toBe('1.234,50')
  })

  it('formats zero', () => {
    expect(formatDecimal2(0)).toBe('0,00')
  })
})

describe('formatNumberLocale', () => {
  it('formats integer with thousands separator', () => {
    expect(formatNumberLocale(10000)).toBe('10.000')
  })

  it('formats decimal preserving original precision', () => {
    expect(formatNumberLocale(3.14)).toBe('3,14')
  })
})

describe('formatDecimalPlaces', () => {
  it('returns fixed fraction digits', () => {
    expect(formatDecimalPlaces(1.5, 3)).toBe('1.500')
  })

  it('rounds to specified places', () => {
    expect(formatDecimalPlaces(1.2345, 2)).toBe('1.23')
  })

  it('handles zero', () => {
    expect(formatDecimalPlaces(0, 2)).toBe('0.00')
  })
})
