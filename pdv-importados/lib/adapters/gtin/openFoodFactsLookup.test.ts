import { describe, expect, it, vi } from 'vitest'
import { lookupOpenFoodFacts } from './openFoodFactsLookup'

describe('lookupOpenFoodFacts', () => {
  it('mapeia product_name_pt quando status=1', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name_pt: 'Leite Condensado',
          brands: 'Nestlé',
          categories: 'Laticínios,Leites',
        },
      }),
    })
    const hit = await lookupOpenFoodFacts('7891000100103', fetchImpl as unknown as typeof fetch)
    expect(hit?.nome).toBe('Leite Condensado')
    expect(hit?.marca).toContain('Nestlé')
    expect(hit?.fonte).toBe('openfoodfacts')
  })

  it('retorna null quando produto não encontrado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 0 }),
    })
    const hit = await lookupOpenFoodFacts('00000000', fetchImpl as unknown as typeof fetch)
    expect(hit).toBeNull()
  })
})
