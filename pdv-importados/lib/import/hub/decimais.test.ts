import { describe, expect, it } from 'vitest'
import { resumoMonetario, comCasas, diferencaDecimal, formatarDecimal, normalizarDecimal, somarDecimais } from './decimais'

describe('normalizarDecimal', () => {
  it('aceita pt-BR e ponto', () => {
    expect(normalizarDecimal('1.234,56', 2)).toBe('1234.56')
    expect(normalizarDecimal('1234,56', 2)).toBe('1234.56')
    expect(normalizarDecimal('1234.56', 2)).toBe('1234.56')
    expect(normalizarDecimal('0,0345', 6)).toBe('0.0345')
    expect(normalizarDecimal(' 5,4321098765 ', 10)).toBe('5.4321098765')
    expect(normalizarDecimal('007', 0)).toBe('7')
  })
  it('recusa excesso de casas, notação científica, lixo e negativo sem permissão', () => {
    for (const v of ['1,234567', '1e3', 'abc', '1,2,3', '1.2.3', '12.34,5x']) expect(normalizarDecimal(v, 5)).toBeNull()
    expect(normalizarDecimal('-10', 2)).toBeNull()
    expect(normalizarDecimal('-10,50', 2, { permitirNegativo: true })).toBe('-10.50')
    expect(normalizarDecimal('', 2)).toBeNull()
    expect(normalizarDecimal('1.23,4', 2)).toBeNull()
  })
})

describe('formatarDecimal', () => {
  it('formata sem float e sem perder casas', () => {
    expect(formatarDecimal('1234567.123456')).toBe('1.234.567,123456')
    expect(formatarDecimal('-0.0001')).toBe('-0,0001')
    expect(formatarDecimal('12', { casasMin: 2 })).toBe('12,00')
    expect(formatarDecimal(null)).toBe('—')
  })
})

describe('somas exatas', () => {
  it('soma e diferença em bigint', () => {
    expect(somarDecimais(['0.1000', '0.2000', null, '1234567890123.4567'], 4)).toBe('1234567890123.7567')
    expect(somarDecimais(['abc'], 4)).toBeNull()
    expect(diferencaDecimal('10.0000', '9.9999', 4)).toBe('-0.0001')
    expect(comCasas('1.5', 4)).toBe('1.5000')
    expect(comCasas('1.123456', 2)).toBe('1.123456')
  })
})

describe('resumoMonetario', () => {
  it('2 casas HALF_UP só para KPI', () => {
    expect(resumoMonetario('1234.5650')).toBe('1.234,57')
    expect(resumoMonetario('0.0000')).toBe('0,00')
    expect(resumoMonetario(null)).toBe('0,00')
  })
})
