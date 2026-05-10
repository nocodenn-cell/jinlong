import { describe, it, expect } from 'vitest'
import type { ItemCarrinho } from '@core/cart/types'
import type { ResultadoPreco } from '@core/pricing/types'
import { calcularTotaisComGerente, ItemCarrinhoComPreco } from './cartStore'

function item(
  overrides: Partial<ItemCarrinho> & { resultado?: ResultadoPreco } = {}
): ItemCarrinhoComPreco {
  const base: ItemCarrinho = {
    id: '1',
    produtoId: 'prod-1',
    nome: 'Produto teste',
    quantidade: 1,
    precoVariejo: 10,
    precoUnitario: 10,
    precoOriginal: 10,
    resultado: {
      precoUnitario: 10,
      precoOriginal: 10,
      descontoUnitario: 0,
      tipoPreco: 'VAREJO',
    },
  }
  const merged = { ...base, ...overrides }
  const resultado: ResultadoPreco =
    overrides.resultado ??
    ({
      precoUnitario: merged.precoVariejo,
      precoOriginal: merged.precoVariejo,
      descontoUnitario: 0,
      tipoPreco: 'VAREJO',
    } as ResultadoPreco)
  return {
    ...(merged as ItemCarrinho),
    precoUnitario: resultado.precoUnitario,
    precoOriginal: resultado.precoOriginal,
    resultado,
  }
}

describe('calcularTotaisComGerente', () => {
  it('não aplica desconto de gerente quando percentual é 0', () => {
    const itens = [item({ quantidade: 2, precoVariejo: 10 })]
    const totais = calcularTotaisComGerente(itens, 0)

    expect(totais.totalBruto).toBe(20)
    expect(totais.totalLiquido).toBe(20)
    expect(totais.totalDesconto).toBe(0)
    expect(totais.descontoGerenteValor).toBe(0)
  })

  it('aplica desconto de gerente sobre o total já com atacado', () => {
    const itens = [
      item({
        quantidade: 2,
        precoVariejo: 10,
        resultado: {
          precoOriginal: 10,
          precoUnitario: 8, // já com desconto de atacado
          descontoUnitario: 2,
          tipoPreco: 'ATACADO',
        },
      }),
    ]

    const totais = calcularTotaisComGerente(itens, 10) // 10% sobre 16

    expect(totais.totalBruto).toBe(20)
    expect(totais.totalLiquido).toBeCloseTo(14.4, 2)
    expect(totais.totalDesconto).toBeCloseTo(5.6, 2) // 4 (atacado) + 1.6 (gerente)
    expect(totais.descontoGerenteValor).toBeCloseTo(1.6, 2)
  })
})

