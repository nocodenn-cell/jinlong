import { describe, expect, it, vi } from 'vitest'
import {
  createInventoryMovementReader,
  mapKardexRow,
} from './inventoryMovementReader'

describe('inventoryMovementReader', () => {
  it('mapKardexRow mapeia delta e motivo', () => {
    expect(
      mapKardexRow({
        id: 'm1',
        created_at: '2026-07-18T00:00:00.000Z',
        tipo_codigo: 'SAIDA_VENDA',
        quantidade_delta: -2,
        observacao: null,
        produto_id: 'p1',
      }),
    ).toEqual({
      movementId: 'm1',
      productId: 'p1',
      type: 'SAIDA_VENDA',
      quantity: -2,
      reason: null,
      createdAt: '2026-07-18T00:00:00.000Z',
    })
  })

  it('listByProduct filtra por produto e loja', async () => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = vi.fn(self)
    chain.eq = vi.fn(self)
    chain.order = vi.fn(self)
    chain.limit = vi.fn(async () => ({
      data: [
        {
          id: 'm1',
          created_at: '2026-07-18T00:00:00.000Z',
          tipo_codigo: 'ENTRADA_AJUSTE',
          quantidade_delta: 1,
          observacao: 'ok',
          produto_id: 'p1',
        },
      ],
      error: null,
    }))
    const from = vi.fn(() => chain)
    const reader = createInventoryMovementReader({ from } as never, 'loja-1')

    const result = await reader.listByProduct({ productId: 'p1', limit: 10 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.movements).toHaveLength(1)
    expect(from).toHaveBeenCalledWith('movimentos_estoque_log')
  })
})
