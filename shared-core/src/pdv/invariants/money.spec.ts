import { describe, expect, it } from 'vitest'
import { moneyApproxEqual, roundMoney2 } from './money'

describe('roundMoney2', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney2(1.235)).toBe(1.24)
    expect(roundMoney2(1.234)).toBe(1.23)
  })

  it('handles zero', () => {
    expect(roundMoney2(0)).toBe(0)
  })

  it('handles negative values', () => {
    expect(roundMoney2(-1.555)).toBe(-1.55)
  })
})

describe('moneyApproxEqual', () => {
  it('returns true for equal values', () => {
    expect(moneyApproxEqual(10, 10)).toBe(true)
  })

  it('returns true within default tolerance (0.02)', () => {
    expect(moneyApproxEqual(10, 10.01)).toBe(true)
    expect(moneyApproxEqual(10, 10.02)).toBe(true)
  })

  it('returns false outside tolerance', () => {
    expect(moneyApproxEqual(10, 10.03)).toBe(false)
  })

  it('respects custom tolerance', () => {
    expect(moneyApproxEqual(10, 10.5, 1)).toBe(true)
    expect(moneyApproxEqual(10, 11.5, 1)).toBe(false)
  })
})
