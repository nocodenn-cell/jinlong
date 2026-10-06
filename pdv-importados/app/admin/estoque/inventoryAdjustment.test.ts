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
      { adjustRpc, reader },
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

  it('chama RPC e recarrega saldo', async () => {
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
      { adjustRpc, reader },
    )

    const result = await svc.adjustInventory({
      productId: 'p1',
      lojaId: 'loja-1',
      quantity: 8,
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
        p_motivo_codigo: 'ACERTO_INVENTARIO',
        p_ator_id: 'u1',
      }),
    )
  })

  it('envia p_saldo_esperado e mapeia concorrência', async () => {
    const adjustRpc = vi.fn(async () => ({
      error: { message: 'AJUSTE_ESTOQUE_CONCORRENCIA: saldo mudou (atual=9, esperado=10).' },
    }))
    const reader = { getBalance: vi.fn(), getBalances: vi.fn() }
    const svc = createInventoryAdjustmentService(
      { rpc: vi.fn() } as never,
      'loja-1',
      { adjustRpc, reader },
    )

    const result = await svc.adjustInventory({
      productId: 'p1',
      lojaId: 'loja-1',
      quantity: 7,
      estoqueMinimo: 1,
      reason: 'PERDA',
      atorId: 'u1',
      saldoEsperado: 10,
    })

    expect(adjustRpc).toHaveBeenCalledWith(
      expect.objectContaining({ p_saldo_esperado: 10, p_quantidade_atual: 7 }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe(INVENTORY_ERROR_CODES.CONCURRENCY)
  })
})

