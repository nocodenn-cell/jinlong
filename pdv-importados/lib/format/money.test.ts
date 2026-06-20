import { describe, expect, it } from 'vitest'
import {
  formatBRL,
  formatDecimal2,
  formatNumberLocale,
  formatDecimalPlaces,
  parseMoney,
} from './money'

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

describe('parseMoney — padrão pt-BR (compatível com Bling, Tiny, Omie, Conta Azul, TOTVS)', () => {
  it('matriz completa de regressão — Entrada → Saída', () => {
    // Padrão pt-BR: vírgula = decimal, ponto = milhar
    expect(parseMoney('1,00')).toBe(1)
    expect(parseMoney('9,99')).toBe(9.99)
    expect(parseMoney('99,99')).toBe(99.99)
    expect(parseMoney('999,99')).toBe(999.99)
    expect(parseMoney('1.234,56')).toBe(1234.56)
    expect(parseMoney('12.345,67')).toBe(12345.67)
    // Ponto com grupo de 3 dígitos → milhar (regra 2)
    expect(parseMoney('1.000')).toBe(1000)
    expect(parseMoney('10.000')).toBe(10000)
    expect(parseMoney('100.000')).toBe(100000)
    expect(parseMoney('1.000,00')).toBe(1000)
    expect(parseMoney('10.000,00')).toBe(10000)
    expect(parseMoney('100.000,00')).toBe(100000)
    // Formato americano sem milhar ainda é aceito (regra 3)
    expect(parseMoney('1234.56')).toBe(1234.56)
    expect(parseMoney('9.99')).toBe(9.99)
  })

  it('round-trip: parseMoney(formatDecimal2(n)) === n', () => {
    // formatDecimal2 emite pt-BR (1.234,56), que parseMoney deve reverter.
    for (const n of [1, 9.99, 999.99, 1000, 1234.56, 10000, 12345.67, 100000]) {
      expect(parseMoney(formatDecimal2(n))).toBeCloseTo(n, 2)
    }
  })

  it('ignora símbolo de moeda e espaços', () => {
    expect(parseMoney('R$ 1.234,56')).toBe(1234.56)
    expect(parseMoney('R$ 100.000,00')).toBe(100000)
    expect(parseMoney('  9,99 ')).toBe(9.99)
  })

  it('suporta valores negativos', () => {
    expect(parseMoney('-5,50')).toBe(-5.5)
  })

  it('retorna NaN para entrada vazia/inválida', () => {
    expect(parseMoney('')).toBeNaN()
    expect(parseMoney('   ')).toBeNaN()
    expect(parseMoney('abc')).toBeNaN()
    expect(parseMoney('-')).toBeNaN()
  })
})
