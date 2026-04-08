import { describe, expect, it } from 'vitest'
import type { ItemCarrinho } from '@/core/cart/types'
import { DEFAULT_PRICING_CONTEXT, type PricingContext } from '@/core/pricing/types'
import { PricingService } from '@/core/pricing/PricingService'

function item(p: Partial<ItemCarrinho> & Pick<ItemCarrinho, 'produtoId' | 'precoVariejo'>): ItemCarrinho {
  return {
    id: 'x',
    nome: 'P',
    quantidade: 1,
    ...p,
  }
}

describe('PricingService — preço atacado do catálogo', () => {
  const svc = new PricingService()
  const ctx: PricingContext = { quantidadeMinimaAtacadoPadrao: 6 }

  it('abaixo do mínimo usa varejo', () => {
    const r = svc.calcularPreco(
      item({
        produtoId: 'a',
        precoVariejo: 10,
        precoAtacado: 7,
        quantidade: 5,
      }),
      [],
      5,
      ctx,
    )
    expect(r.tipoPreco).toBe('VAREJO')
    expect(r.precoUnitario).toBe(10)
  })

  it('atingindo o mínimo aplica preco_atacado', () => {
    const r = svc.calcularPreco(
      item({
        produtoId: 'a',
        precoVariejo: 10,
        precoAtacado: 7,
        quantidade: 6,
      }),
      [],
      6,
      ctx,
    )
    expect(r.tipoPreco).toBe('ATACADO')
    expect(r.precoUnitario).toBe(7)
    expect(r.precoOriginal).toBe(10)
  })

  it('sem preco_atacado mantém regras / varejo', () => {
    const r = svc.calcularPreco(
      item({ produtoId: 'a', precoVariejo: 12, quantidade: 10 }),
      [],
      10,
      DEFAULT_PRICING_CONTEXT,
    )
    expect(r.tipoPreco).toBe('VAREJO')
    expect(r.precoUnitario).toBe(12)
  })
})
