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

describe('equivalência roundMoney2 <-> roundAbnt(value, 2) — SSoT única de arredondamento monetário', () => {
  // Valores onde Math.round(v*100)/100 (implementação ingênua anterior) e
  // roundAbnt(v,2) concordam — devem continuar concordando após a unificação.
  const casosNormais = [0, 1, 10.1, 10.12, 100, 1234.56, -10.12, -0.01, 999999.99, 1.045, 2.675, 10.005, 0.005]

  // Valores de borda onde Math.round(v*100)/100 diverge de roundAbnt(v,2) por
  // erro clássico de representação em ponto flutuante (ex.: 1.005*100 ===
  // 100.49999999999999, arredondando para baixo). roundMoney2 deve seguir
  // roundAbnt nesses casos, não a implementação ingênua.
  const casosDeBorda = [1.005, 1.015, 1.025, 35.855, 0.145, -1.005, -2.675]

  it.each(casosNormais)('valor normal %f: roundMoney2 === roundAbnt(v, 2)', (v) => {
    expect(roundMoney2(v)).toBe(roundAbnt(v, 2))
  })

  it.each(casosDeBorda)('valor de borda %f: roundMoney2 === roundAbnt(v, 2) (não a implementação ingênua)', (v) => {
    expect(roundMoney2(v)).toBe(roundAbnt(v, 2))
  })

  it('documenta o bug que a unificação corrige: Math.round(1.005*100)/100 ingenuamente dá 1, não 1.01', () => {
    expect(Math.round(1.005 * 100) / 100).toBe(1)
    expect(roundMoney2(1.005)).toBe(1.01)
  })
})
