import { describe, expect, it } from 'vitest'
import { roundMoney2 } from '@/shared/cart/totals'
import { roundAbnt } from './roundAbnt'

describe('roundAbnt (alinhado a Postgres ROUND / round_abnt)', () => {
  it('2 casas: half away from zero (casos típicos de caixa)', () => {
    expect(roundAbnt(10.124, 2)).toBe(10.12)
    expect(roundAbnt(10.125, 2)).toBe(10.13)
    expect(roundAbnt(10.126, 2)).toBe(10.13)
    expect(roundAbnt(1.005, 2)).toBe(1.01)
  })

  it('2 casas: valores negativos', () => {
    expect(roundAbnt(-2.554, 2)).toBe(-2.55)
    expect(roundAbnt(-2.555, 2)).toBe(-2.56)
  })

  it('3 casas: quantidade / balança', () => {
    expect(roundAbnt(0.1255, 3)).toBe(0.126)
    expect(roundAbnt(0.1254, 3)).toBe(0.125)
  })

  it('roundMoney2 via re-export usa scale 2', () => {
    expect(roundMoney2(10.125)).toBe(10.13)
  })
})
