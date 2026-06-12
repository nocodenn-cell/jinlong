import { describe, expect, it } from 'vitest'
import {
  parseQuantidadeCaixaInput,
  quantidadeCaixaTemAte3Casas,
  roundQuantidadeCaixa3,
} from './quantidadeCaixa'

describe('roundQuantidadeCaixa3', () => {
  it('rounds to 3 decimal places', () => {
    expect(roundQuantidadeCaixa3(1.2345)).toBe(1.235)
  })

  it('preserves value already at 3 places', () => {
    expect(roundQuantidadeCaixa3(2.5)).toBe(2.5)
  })

  it('rounds zero', () => {
    expect(roundQuantidadeCaixa3(0)).toBe(0)
  })
})

describe('parseQuantidadeCaixaInput', () => {
  it('normalizes finite input', () => {
    expect(parseQuantidadeCaixaInput(3.1415)).toBe(3.142)
  })

  it('returns 0 for NaN', () => {
    expect(parseQuantidadeCaixaInput(NaN)).toBe(0)
  })

  it('returns 0 for Infinity', () => {
    expect(parseQuantidadeCaixaInput(Infinity)).toBe(0)
  })
})

describe('quantidadeCaixaTemAte3Casas', () => {
  it('returns true for value with up to 3 decimal places', () => {
    expect(quantidadeCaixaTemAte3Casas(1.123)).toBe(true)
  })

  it('returns true for integer', () => {
    expect(quantidadeCaixaTemAte3Casas(5)).toBe(true)
  })

  it('returns false for non-finite', () => {
    expect(quantidadeCaixaTemAte3Casas(NaN)).toBe(false)
  })

  it('returns false for zero or negative', () => {
    expect(quantidadeCaixaTemAte3Casas(0)).toBe(false)
    expect(quantidadeCaixaTemAte3Casas(-1)).toBe(false)
  })
})
