import { describe, expect, it, vi } from 'vitest'
import { INVENTORY_ERROR_CODES } from '@shared-core/src/inventory'
import { createInventoryAdjustmentService } from './inventoryAdjustment'

describe('createInventoryAdjustmentService', () => {
  it('rejeita motivo inválido via policy (sem RPC)', async () => {
    const adjustRpc = vi.fn()
    const reader = {
      getBalance: vi.fn(),
      getBalances: vi.fn(),
    }
    const svc = createInventoryAdjustmentService(
      { rpc: vi.fn() } as never,
      'loja-1',
      { adjustRpc, reader, unidadeDoProduto: async () => null },
    )

    const result = await svc.adjustInventory({
      productId: 'p1',
      lojaId: 'loja-1',
      quantity: 1,
      reason: 'INVALIDO',
      atorId: 'u1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe(INVENTORY_ERROR_CODES.REASON_INVALID)
    expect(adjustRpc).not.toHaveBeenCalled()
  })

  it('chama RPC seguro com snapshot e recarrega saldo', async () => {
    const adjustRpc = vi.fn(async () => ({ error: null }))
    const reader = {
      getBalance: vi.fn(async () => ({
        ok: true as const,
        item: {
          productId: 'p1',
          lojaId: 'loja-1',
          quantity: 8,
          available: 8,
          minimum: 1,
        },
      })),
      getBalances: vi.fn(),
    }
    const svc = createInventoryAdjustmentService(
      { rpc: vi.fn() } as never,
      'loja-1',
      { adjustRpc, reader, unidadeDoProduto: async () => null },
    )

    const result = await svc.adjustInventory({
      productId: 'p1',
      lojaId: 'loja-1',
      quantity: 8,
      expectedQuantity: 10,
      expectedMinimum: 1,
      estoqueMinimo: 1,
      reason: 'ACERTO_INVENTARIO',
      atorId: 'u1',
    })

    expect(result).toEqual({
      ok: true,
      item: {
        productId: 'p1',
        lojaId: 'loja-1',
        quantity: 8,
        available: 8,
        minimum: 1,
      },
    })
    expect(adjustRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        p_produto_id: 'p1',
        p_quantidade_atual: 8,
        p_quantidade_esperada: 10,
        p_minimo_esperado: 1,
        p_motivo_codigo: 'ACERTO_INVENTARIO',
        p_ator_id: 'u1',
      }),
    )
  })

  it('conflito da RPC chega como STALE_BALANCE e não recarrega como sucesso', async () => {
    const reader = { getBalance: vi.fn(), getBalances: vi.fn() }
    const adjustRpc = vi.fn(async () => ({ error: { message: 'AJUSTE_ESTOQUE_SALDO_ALTERADO' } }))
    const service = createInventoryAdjustmentService(
      { rpc: vi.fn() } as never,
      'loja-1',
      { reader, adjustRpc, unidadeDoProduto: async () => null },
    )
    const result = await service.adjustInventory({
      productId: 'p1',
      lojaId: 'loja-1',
      quantity: 8,
      estoqueMinimo: 2,
      expectedQuantity: 10,
      expectedMinimum: 1,
      reason: 'ACERTO_INVENTARIO',
      atorId: 'u1',
    })
    expect(result).toMatchObject({ ok: false, code: INVENTORY_ERROR_CODES.STALE_BALANCE })
    if (!result.ok) expect(result.error).toMatch(/alterado|mudou/i)
    expect(reader.getBalance).not.toHaveBeenCalled()
  })
})
