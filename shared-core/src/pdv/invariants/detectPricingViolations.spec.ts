import { describe, expect, it } from 'vitest'
import { detectPricingViolations, itensPricingValidos } from './detectPricingViolations'
import type { ItemCarrinho } from '../../stores/unifiedCartStore'

function makeItem(overrides: Partial<ItemCarrinho> = {}): ItemCarrinho {
  return {
    id: 'i1',
    produtoId: 'p1',
    nome: 'Produto Teste',
    quantidade: 1,
    precoUnitario: 10,
    precoOriginal: 10,
    resultado: {
      precoUnitario: 10,
      precoOriginal: 10,
      descontoUnitario: 0,
      tipoPreco: 'VAREJO',
    },
    ...overrides,
  }
}

describe('detectPricingViolations', () => {
  it('retorna lista vazia para item válido', () => {
    expect(detectPricingViolations([makeItem()])).toHaveLength(0)
  })

  it('detecta resultado ausente', () => {
    const item = makeItem({ resultado: undefined })
    const vs = detectPricingViolations([item])
    expect(vs.some((v) => v.code === 'PRICING_RESULTADO_AUSENTE')).toBe(true)
    expect(vs[0].severity).toBe('error')
  })

  it('detecta tipoPreco inválido', () => {
    const item = makeItem({
      resultado: { precoUnitario: 10, precoOriginal: 10, descontoUnitario: 0, tipoPreco: 'INVALIDO' as never },
    })
    const vs = detectPricingViolations([item])
    expect(vs.some((v) => v.code === 'PRICING_TIPO_INVALIDO')).toBe(true)
  })

  it('detecta precoUnitario negativo', () => {
    const item = makeItem({
      resultado: { precoUnitario: -1, precoOriginal: 10, descontoUnitario: 11, tipoPreco: 'VAREJO' },
    })
    const vs = detectPricingViolations([item])
    expect(vs.some((v) => v.code === 'PRICING_PRECO_INVALIDO')).toBe(true)
  })

  it('detecta desconto inconsistente (diverge mais que EPS)', () => {
    const item = makeItem({
      resultado: {
        precoUnitario: 8,
        precoOriginal: 10,
        descontoUnitario: 5,
        tipoPreco: 'VAREJO',
      },
    })
    const vs = detectPricingViolations([item])
    expect(vs.some((v) => v.code === 'PRICING_DESCONTO_INCONSISTENTE')).toBe(true)
    expect(vs[0].severity).toBe('warning')
  })

  it('não flagga desconto dentro do EPS', () => {
    const item = makeItem({
      resultado: {
        precoUnitario: 8,
        precoOriginal: 10,
        descontoUnitario: 2.01,
        tipoPreco: 'ATACADO',
      },
    })
    const vs = detectPricingViolations([item])
    expect(vs.some((v) => v.code === 'PRICING_DESCONTO_INCONSISTENTE')).toBe(false)
  })

  it('detecta precoUnitario acima do precoOriginal (violação de teto)', () => {
    const item = makeItem({
      resultado: {
        precoUnitario: 15,
        precoOriginal: 10,
        descontoUnitario: -5,
        tipoPreco: 'VAREJO',
      },
    })
    const vs = detectPricingViolations([item])
    expect(vs.some((v) => v.code === 'PRICING_PRECO_ACIMA_ORIGINAL')).toBe(true)
  })

  it('aceita todos os quatro tipoPreco autorizados', () => {
    const tipos = ['VAREJO', 'ATACADO', 'MANUAL', 'PROMOCAO'] as const
    for (const tipo of tipos) {
      const item = makeItem({
        resultado: { precoUnitario: 9, precoOriginal: 10, descontoUnitario: 1, tipoPreco: tipo },
      })
      const vs = detectPricingViolations([item]).filter((v) => v.code === 'PRICING_TIPO_INVALIDO')
      expect(vs).toHaveLength(0)
    }
  })
})

describe('itensPricingValidos', () => {
  it('retorna true para carrinho limpo', () => {
    expect(itensPricingValidos([makeItem()])).toBe(true)
  })

  it('retorna false quando há erro de preço', () => {
    const item = makeItem({ resultado: undefined })
    expect(itensPricingValidos([item])).toBe(false)
  })

  it('retorna true para warnings (somente erros bloqueiam)', () => {
    const item = makeItem({
      resultado: {
        precoUnitario: 8,
        precoOriginal: 10,
        descontoUnitario: 5,
        tipoPreco: 'VAREJO',
      },
    })
    expect(itensPricingValidos([item])).toBe(true)
  })
})
