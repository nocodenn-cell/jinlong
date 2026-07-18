import { describe, expect, it, vi } from 'vitest'
import { INVENTORY_ERROR_CODES } from '@shared-core/src/inventory'
import { createInventoryMovementWriter } from './inventoryMovementWriter'

describe('createInventoryMovementWriter', () => {
  it('transfer rejeita mesma loja sem RPC', async () => {
    const transfer = vi.fn()
    const writer = createInventoryMovementWriter(
      { rpc: vi.fn() } as never,
      'l1',
      {
        rpc: {
          transfer,
          confirmRemessa: vi.fn(),
          importNfe: vi.fn(),
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    const result = await writer.transfer({
      lojaOrigemId: 'a',
      lojaDestinoId: 'a',
      productId: 'p1',
      quantity: 1,
      idempotencyKey: 'k1',
      saldoEsperado: 1,
    })

    expect(result).toMatchObject({
      ok: false,
      code: INVENTORY_ERROR_CODES.TRANSFER_SAME_STORE,
    })
    expect(transfer).not.toHaveBeenCalled()
  })

  it('transfer delega à RPC transferir_estoque_seguro', async () => {
    const transfer = vi.fn(async () => ({ data: 'transf-1', error: null }))
    const writer = createInventoryMovementWriter(
      { rpc: vi.fn() } as never,
      'l1',
      {
        rpc: {
          transfer,
          confirmRemessa: vi.fn(),
          importNfe: vi.fn(),
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    await expect(
      writer.transfer({
        lojaOrigemId: 'origem',
        lojaDestinoId: 'destino',
        productId: 'p1',
        quantity: 2,
        idempotencyKey: 'idem-1',
        saldoEsperado: 5,
      }),
    ).resolves.toEqual({ ok: true, transferenciaId: 'transf-1' })

    expect(transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        p_loja_origem: 'origem',
        p_loja_destino: 'destino',
        p_quantidade: 2,
        p_idempotency_key: 'idem-1',
      }),
    )
  })

  it('confirmRemessaEntrada delega à RPC', async () => {
    const confirmRemessa = vi.fn(async () => ({ error: null }))
    const writer = createInventoryMovementWriter(
      { rpc: vi.fn() } as never,
      'l1',
      {
        rpc: {
          transfer: vi.fn(),
          confirmRemessa,
          importNfe: vi.fn(),
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    await expect(
      writer.confirmRemessaEntrada({ remessaId: 'rem-1' }),
    ).resolves.toEqual({ ok: true, remessaId: 'rem-1' })
    expect(confirmRemessa).toHaveBeenCalledWith({ p_remessa_id: 'rem-1' })
  })
})
