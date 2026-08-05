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

  // FLX-04: receber_ordem_compra não pode mais creditar estoque sem conferência
  // prévia gravada no servidor. O writer precisa registrar a conferência ANTES
  // de chamar o recebimento — e nunca chamar o recebimento se a conferência falhar.
  describe('receiveOrdemCompra (FLX-04)', () => {
    it('registra conferência antes de receber, na ordem certa', async () => {
      const chamadas: string[] = []
      const conferirOc = vi.fn(async () => {
        chamadas.push('conferir')
        return { data: { ok: true }, error: null }
      })
      const receiveOc = vi.fn(async () => {
        chamadas.push('receber')
        return { error: null }
      })
      const writer = createInventoryMovementWriter(
        { rpc: vi.fn() } as never,
        'l1',
        {
          rpc: {
            transfer: vi.fn(),
            confirmRemessa: vi.fn(),
            importNfe: vi.fn(),
            conferirOc,
            receiveOc,
          },
          adjustment: { adjustInventory: vi.fn() },
        },
      )

      await expect(
        writer.receiveOrdemCompra({
          ocId: 'oc-1',
          itens: [{ itemId: 'item-1', quantidadeRecebida: 8 }],
        }),
      ).resolves.toEqual({ ok: true, ocId: 'oc-1' })

      expect(chamadas).toEqual(['conferir', 'receber'])
      // A quantidade que o operador informa vira quantidade CONFERIDA, não um
      // parâmetro de recebimento direto — é isso que fecha FLX-04.
      expect(conferirOc).toHaveBeenCalledWith({
        p_oc_id: 'oc-1',
        p_itens: [{ item_id: 'item-1', quantidade_conferida: 8 }],
      })
      // receber_ordem_compra não aceita mais quantidade do cliente — só o id da OC.
      expect(receiveOc).toHaveBeenCalledWith({ p_oc_id: 'oc-1' })
    })

    it('não chama receber_ordem_compra se a conferência falhar', async () => {
      const conferirOc = vi.fn(async () => ({
        data: null,
        error: { message: 'OC_CONFERENCIA_QTD_INVALIDA' },
      }))
      const receiveOc = vi.fn(async () => ({ error: null }))
      const writer = createInventoryMovementWriter(
        { rpc: vi.fn() } as never,
        'l1',
        {
          rpc: {
            transfer: vi.fn(),
            confirmRemessa: vi.fn(),
            importNfe: vi.fn(),
            conferirOc,
            receiveOc,
          },
          adjustment: { adjustInventory: vi.fn() },
        },
      )

      const result = await writer.receiveOrdemCompra({
        ocId: 'oc-1',
        itens: [{ itemId: 'item-1', quantidadeRecebida: 5 }],
      })

      expect(conferirOc).toHaveBeenCalled()
      expect(result.ok).toBe(false)
      expect(receiveOc).not.toHaveBeenCalled()
    })
  })
})
