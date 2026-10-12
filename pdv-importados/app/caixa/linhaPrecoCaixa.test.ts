import { describe, expect, it } from 'vitest'
import { descontoLinhaCaixa, exibeDescontoTabela, subtotalLinhaCaixa } from './linhaPrecoCaixa'

describe('linhaPrecoCaixa', () => {
  it('subtotal usa round_abnt (1,005 → 1,01), não Math.round ingênuo', () => {
    expect(Math.round(1.005 * 100) / 100).toBe(1)
    expect(subtotalLinhaCaixa(1.005, 1)).toBe(1.01)
  })

  it('desconto da linha de atacado: (10 − 8) × 10 = 20', () => {
    expect(exibeDescontoTabela(10, 8)).toBe(true)
    expect(descontoLinhaCaixa(10, 8, 10)).toBe(20)
    expect(subtotalLinhaCaixa(8, 10)).toBe(80)
  })

  it('sem diferença de preço não inventa desconto', () => {
    expect(exibeDescontoTabela(10, 10)).toBe(false)
    expect(descontoLinhaCaixa(10, 10, 4)).toBe(0)
  })

  it('quantidade fracionada arredonda o subtotal em 2 casas', () => {
    expect(subtotalLinhaCaixa(1.99, 0.125)).toBe(0.25)
  })
})
