import { describe, expect, it } from 'vitest'
import { comissaoItemLiquido, ratearCentavos } from './rateio'

describe('ratearCentavos (espelho do SQL)', () => {
  it('rateia 10,00 em 100 / 33,33 / 66,66 = 5,00 / 1,67 / 3,33', () => {
    expect(ratearCentavos([100, 33.33, 66.66], 10)).toEqual([5, 1.67, 3.33])
  })
  it('soma sempre fecha no centavo', () => {
    const pesos = [19.99, 0.01, 7.77, 123.45, 3]
    const partes = ratearCentavos(pesos, 13.37)
    expect(Math.round(partes.reduce((a, b) => a + b, 0) * 100)).toBe(1337)
  })
  it('empate de resto vai para o menor índice', () => {
    expect(ratearCentavos([1, 1, 1], 0.02)).toEqual([0.01, 0.01, 0])
  })
  it('desconto nunca maior que a base', () => {
    expect(ratearCentavos([10], 50)).toEqual([10])
  })
  it('base zero ou desconto zero => zeros', () => {
    expect(ratearCentavos([0, 0], 5)).toEqual([0, 0])
    expect(ratearCentavos([10, 20], 0)).toEqual([0, 0])
    expect(ratearCentavos([], 5)).toEqual([])
  })
  it('é determinístico', () => {
    const a = ratearCentavos([3.33, 3.33, 3.34], 1)
    expect(ratearCentavos([3.33, 3.33, 3.34], 1)).toEqual(a)
  })
})

describe('comissaoItemLiquido', () => {
  it('percentual sobre base líquida', () => {
    expect(comissaoItemLiquido({ quantidade: 2, precoUnitario: 33.33, desconto: 3.33, tipo: 'percentual', percentual: 5 })).toBe(3.17)
  })
  it('fixo por unidade ignora desconto', () => {
    expect(comissaoItemLiquido({ quantidade: 3, precoUnitario: 10, desconto: 5, tipo: 'fixo', valorFixo: 2.5 })).toBe(7.5)
  })
  it('venda 199,99 com 10,00 de desconto a 5% = 9,50 (antes 10,00)', () => {
    const pesos = [100, 33.33, 66.66]
    const desc = ratearCentavos(pesos, 10)
    const total = pesos.reduce((acc, p, i) => acc + comissaoItemLiquido({ quantidade: 1, precoUnitario: p, desconto: desc[i], tipo: 'percentual', percentual: 5 }), 0)
    expect(Math.round(total * 100) / 100).toBe(9.5)
  })
})
