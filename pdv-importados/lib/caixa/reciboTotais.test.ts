import { describe, expect, it } from 'vitest'
import { descontoProdutosLiquido } from './reciboTotais'

describe('descontoProdutosLiquido', () => {
  it('subtrai o desconto do gerente do total de desconto', () => {
    expect(descontoProdutosLiquido({ totalDesconto: 15, valorDescontoGerente: 5 })).toBe(10)
  })

  it('só desconto do gerente: resultado 0', () => {
    expect(descontoProdutosLiquido({ totalDesconto: 5, valorDescontoGerente: 5 })).toBe(0)
  })

  it('sem descontos: 0', () => {
    expect(descontoProdutosLiquido({ totalDesconto: 0, valorDescontoGerente: 0 })).toBe(0)
  })

  it('nunca negativo', () => {
    expect(descontoProdutosLiquido({ totalDesconto: 3, valorDescontoGerente: 5 })).toBe(0)
  })

  it('arredonda a 2 casas (ruído de ponto flutuante)', () => {
    expect(descontoProdutosLiquido({ totalDesconto: 0.3, valorDescontoGerente: 0.1 })).toBe(0.2)
  })
})
