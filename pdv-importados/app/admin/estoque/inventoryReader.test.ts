import { describe, expect, it, vi } from 'vitest'
import type { InventoryReader } from '@shared-core/src/inventory'
import {
  createInventoryReader,
  mapEstoqueRow,
  type EstoqueRow,
} from './inventoryReader'

const LOJA = 'loja-1'

function baseRow(over: Partial<EstoqueRow> = {}): EstoqueRow {
  return {
    produto_id: 'p1',
    loja_id: LOJA,
    quantidade_atual: 10,
    estoque_minimo: 2,
    ...over,
  }
}

function mockQuery(result: { data: unknown; error: unknown }) {
  const qb: Record<string, unknown> = {}
  const self = () => qb
  qb.select = vi.fn(self)
  qb.eq = vi.fn(self)
  qb.in = vi.fn(self)
  qb.maybeSingle = vi.fn(async () => result)
  Object.assign(qb, {
    then(onFulfilled: (v: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled)
    },
  })
  return qb
}

describe('inventoryReader — mapping', () => {
  it('mapEstoqueRow inclui quantity, available e minimum', () => {
    expect(mapEstoqueRow(baseRow())).toEqual({
      productId: 'p1',
      lojaId: LOJA,
      quantity: 10,
      available: 10,
      minimum: 2,
    })
  })

  it('available espelha quantity; minimum vem de estoque_minimo', () => {
    const item = mapEstoqueRow(
      baseRow({ quantidade_atual: 0, estoque_minimo: '5' }),
    )
    expect(item.available).toBe(0)
    expect(item.minimum).toBe(5)
  })
})

describe('createInventoryReader — SELECT estoque', () => {
  it('implementa só getBalance / getBalances', () => {
    const reader = createInventoryReader({ from: vi.fn() } as never, LOJA)
    expect(Object.keys(reader).sort()).toEqual(['getBalance', 'getBalances'])
    const typed: InventoryReader = reader
    expect(typed.getBalance).toBeTypeOf('function')
  })

  it('getBalance retorna item com minimum', async () => {
    const qb = mockQuery({
      data: baseRow({ quantidade_atual: 7, estoque_minimo: 3 }),
      error: null,
    })
    const from = vi.fn(() => qb)
    const reader = createInventoryReader({ from } as never, LOJA)

    await expect(reader.getBalance('p1')).resolves.toEqual({
      ok: true,
      item: {
        productId: 'p1',
        lojaId: LOJA,
        quantity: 7,
        available: 7,
        minimum: 3,
      },
    })
    expect(from).toHaveBeenCalledWith('estoque')
  })

  it('getBalance retorna notFound quando não há linha', async () => {
    const qb = mockQuery({ data: null, error: null })
    const reader = createInventoryReader({ from: vi.fn(() => qb) } as never, LOJA)

    await expect(reader.getBalance('missing')).resolves.toMatchObject({
      ok: false,
      notFound: true,
    })
  })

  it('getBalances mapeia minimum por linha', async () => {
    const rows = [
      baseRow({ produto_id: 'p1', quantidade_atual: 1, estoque_minimo: 0 }),
      baseRow({ produto_id: 'p2', quantidade_atual: 2, estoque_minimo: 4 }),
    ]
    const qb = mockQuery({ data: rows, error: null })
    const reader = createInventoryReader({ from: vi.fn(() => qb) } as never, LOJA)

    await expect(reader.getBalances(['p1', 'p2'])).resolves.toEqual({
      ok: true,
      items: [
        { productId: 'p1', lojaId: LOJA, quantity: 1, available: 1, minimum: 0 },
        { productId: 'p2', lojaId: LOJA, quantity: 2, available: 2, minimum: 4 },
      ],
    })
  })

  it('getBalances vazio não chama Supabase', async () => {
    const from = vi.fn()
    const reader = createInventoryReader({ from } as never, LOJA)
    await expect(reader.getBalances([])).resolves.toEqual({ ok: true, items: [] })
    expect(from).not.toHaveBeenCalled()
  })
})
