import { describe, expect, it, expectTypeOf } from 'vitest'
import type {
  AdjustInventoryCommand,
  InventoryAdjustmentService,
  InventoryItem,
  InventoryMovement,
  InventoryMovementReader,
  InventoryMovementWriter,
  InventoryQueryService,
  InventoryReader,
  InventoryStockListQuery,
  ProductId,
  RegisterMovementCommand,
} from './index'
import {
  INVENTORY_ERROR_CODES,
  mapAjusteRpcMessageToCode,
  validateAdjustInventoryCommand,
} from './index'

function sampleItem(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    productId: 'p1',
    lojaId: 'l1',
    quantity: 10,
    available: 10,
    minimum: 2,
    ...over,
  }
}

describe('inventory — types', () => {
  it('InventoryItem inclui quantity, available e minimum', () => {
    const item = sampleItem()
    expect(item.quantity).toBe(10)
    expect(item.available).toBe(10)
    expect(item.minimum).toBe(2)
    expectTypeOf(item.productId).toEqualTypeOf<ProductId>()
  })

  it('available permanece campo distinto mesmo quando igual a quantity', () => {
    const item = sampleItem({ quantity: 0, available: 0, minimum: 0 })
    expect(item).toHaveProperty('available')
    expect(item.available).toBe(item.quantity)
  })

  it('InventoryMovement representa evento de kardex', () => {
    const movement: InventoryMovement = {
      movementId: 'm1',
      productId: 'p1',
      type: 'SAIDA_VENDA',
      quantity: -1,
      reason: null,
      createdAt: '2026-07-18T12:00:00.000Z',
    }
    expect(movement.type).toBe('SAIDA_VENDA')
  })
})

describe('inventory — contracts (split de leitura)', () => {
  it('InventoryReader só saldo pontual', async () => {
    const reader: InventoryReader = {
      async getBalance(productId) {
        return { ok: true, item: sampleItem({ productId }) }
      },
      async getBalances(productIds) {
        return {
          ok: true,
          items: productIds.map((productId) => sampleItem({ productId, quantity: 0, available: 0, minimum: 0 })),
        }
      },
    }
    expect(Object.keys(reader).sort()).toEqual(['getBalance', 'getBalances'])
    await expect(reader.getBalance('p1')).resolves.toMatchObject({ ok: true })
  })

  it('InventoryMovementReader é contrato separado (kardex)', async () => {
    const reader: InventoryMovementReader = {
      async listByProduct() {
        return { ok: true, movements: [] }
      },
    }
    expect(Object.keys(reader)).toEqual(['listByProduct'])
    await expect(reader.listByProduct({ productId: 'p1', limit: 60 })).resolves.toEqual({
      ok: true,
      movements: [],
    })
  })

  it('InventoryQueryService cobre grade admin sem ser ListReader genérico', async () => {
    const query: InventoryStockListQuery = {
      lojaId: 'l1',
      visao: 'critico',
      busca: 'abc',
      categoriaId: null,
      limite: 25,
      offset: 0,
    }
    const svc: InventoryQueryService = {
      async listStockPage() {
        return { ok: true, total: 0, rows: [] }
      },
    }
    expect(Object.keys(svc)).toEqual(['listStockPage'])
    await expect(svc.listStockPage(query)).resolves.toEqual({ ok: true, total: 0, rows: [] })
  })

  it('InventoryMovementWriter tipa superfície inventory-led', async () => {
    const command: RegisterMovementCommand = {
      productId: 'p1',
      lojaId: 'l1',
      type: 'ENTRADA_AJUSTE',
      quantity: 2,
      reason: 'COMPRA',
    }
    const writer: InventoryMovementWriter = {
      async registerMovement() {
        return { ok: false, error: 'not wired' }
      },
      async transfer() {
        return { ok: false, error: 'not wired' }
      },
      async confirmRemessaEntrada() {
        return { ok: false, error: 'not wired' }
      },
      async importNfe() {
        return { ok: false, error: 'not wired' }
      },
      async registrarConferenciaNfe() {
        return { ok: false, error: 'not wired' }
      },
      async confirmarImportacaoNfe() {
        return { ok: false, error: 'not wired' }
      },
    }
    expect(Object.keys(writer).sort()).toEqual([
      'confirmRemessaEntrada',
      'confirmarImportacaoNfe',
      'importNfe',
      'registerMovement',
      'registrarConferenciaNfe',
      'transfer',
    ])
    await expect(writer.registerMovement(command)).resolves.toEqual({
      ok: false,
      error: 'not wired',
    })
  })

  it('InventoryAdjustmentService tipa comando', async () => {
    const command: AdjustInventoryCommand = {
      productId: 'p1',
      lojaId: 'l1',
      quantity: 5,
      reason: 'ACERTO_INVENTARIO',
    }
    const svc: InventoryAdjustmentService = {
      async adjustInventory() {
        return { ok: false, error: 'not wired' }
      },
    }
    await expect(svc.adjustInventory(command)).resolves.toEqual({
      ok: false,
      error: 'not wired',
    })
  })

  it('errorCodes mapeiam fragmentos da RPC de ajuste', () => {
    expect(mapAjusteRpcMessageToCode('AJUSTE_ESTOQUE_QTD_INVALIDA')).toBe(
      INVENTORY_ERROR_CODES.QTY_INVALID,
    )
    expect(mapAjusteRpcMessageToCode('AJUSTE_ESTOQUE_SALDO_ALTERADO')).toBe(
      INVENTORY_ERROR_CODES.STALE_BALANCE,
    )
    expect(validateAdjustInventoryCommand({
      productId: 'p1',
      lojaId: 'l1',
      quantity: 1,
      reason: 'COMPRA',
    }).ok).toBe(true)
  })
})


describe('inventory — barrel exports', () => {
  it('reexporta policies puras sem side effects de Supabase', async () => {
    const mod = await import('./index')
    expect(mod).toBeDefined()
    const fns = Object.keys(mod).filter(
      (k) => typeof (mod as Record<string, unknown>)[k] === 'function',
    )
    expect(fns.sort()).toEqual([
      'mapAjusteRpcMessageToCode',
      'validateAdjustInventoryCommand',
    ])
  })
})
