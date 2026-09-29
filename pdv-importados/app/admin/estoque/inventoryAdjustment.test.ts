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
})

describe('createInventoryAdjustmentService — mínimo omitido não zera o mínimo atual', () => {
  const comando = {
    productId: 'p1',
    lojaId: 'loja-1',
    quantity: 8,
    reason: 'ACERTO_INVENTARIO',
    atorId: 'u1',
  }
  const item = (minimum: number) => ({
    ok: true as const,
    item: { productId: 'p1', lojaId: 'loja-1', quantity: 8, available: 8, minimum },
  })

  it('sem estoqueMinimo no comando: envia à RPC o mínimo ATUAL da linha (não 0)', async () => {
    const adjustRpc = vi.fn(async () => ({ error: null }))
    const getBalance = vi.fn(async () => item(7))
    const svc = createInventoryAdjustmentService({ rpc: vi.fn() } as never, 'loja-1', {
      adjustRpc,
      reader: { getBalance, getBalances: vi.fn() },
    })

    const result = await svc.adjustInventory(comando)

    expect(result.ok).toBe(true)
    expect(adjustRpc).toHaveBeenCalledWith(expect.objectContaining({ p_estoque_minimo: 7 }))
  })

  it('com estoqueMinimo explícito (inclusive 0): usa o informado e não consulta o mínimo atual', async () => {
    const adjustRpc = vi.fn(async () => ({ error: null }))
    const getBalance = vi.fn(async () => item(7))
    const svc = createInventoryAdjustmentService({ rpc: vi.fn() } as never, 'loja-1', {
      adjustRpc,
      reader: { getBalance, getBalances: vi.fn() },
    })

    await svc.adjustInventory({ ...comando, estoqueMinimo: 0 })

    expect(adjustRpc).toHaveBeenCalledWith(expect.objectContaining({ p_estoque_minimo: 0 }))
    // A única leitura é a de recarga do saldo, depois do ajuste.
    expect(getBalance).toHaveBeenCalledTimes(1)
  })

  it('falha ao ler o mínimo atual: NÃO chama a RPC (não arrisca zerar) e devolve READ_FAILED', async () => {
    const adjustRpc = vi.fn(async () => ({ error: null }))
    const getBalance = vi.fn(async () => ({ ok: false as const, error: 'db down' }))
    const svc = createInventoryAdjustmentService({ rpc: vi.fn() } as never, 'loja-1', {
      adjustRpc,
      reader: { getBalance, getBalances: vi.fn() },
    })

    const result = await svc.adjustInventory(comando)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe(INVENTORY_ERROR_CODES.READ_FAILED)
    expect(adjustRpc).not.toHaveBeenCalled()
  })

  it('linha inexistente (legado): não há mínimo a preservar → 0, e a RPC responde "não encontrado"', async () => {
    const adjustRpc = vi.fn(async () => ({ error: { message: 'AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA' } }))
    const getBalance = vi.fn(async () => ({
      ok: false as const,
      error: 'Estoque não encontrado para o produto nesta loja.',
      notFound: true as const,
    }))
    const svc = createInventoryAdjustmentService({ rpc: vi.fn() } as never, 'loja-1', {
      adjustRpc,
      reader: { getBalance, getBalances: vi.fn() },
    })

    const result = await svc.adjustInventory(comando)

    expect(adjustRpc).toHaveBeenCalledWith(expect.objectContaining({ p_estoque_minimo: 0 }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.notFound).toBe(true)
  })
})
