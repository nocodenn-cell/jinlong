import { describe, expect, it, expectTypeOf } from 'vitest'
import type {
  AdjustInventoryCommand,
  InventoryAdjustmentService,
  InventoryItem,
  InventoryMovement,
  InventoryMovementWriter,
  InventoryReader,
  ProductId,
  RegisterMovementCommand,
} from './index'

describe('inventory scaffold — types (Inventory 2)', () => {
  it('InventoryItem representa saldo sem regra de negócio', () => {
    const item: InventoryItem = {
      productId: 'p1',
      lojaId: 'l1',
      quantity: 10,
      available: 10,
    }
    expect(item.quantity).toBe(10)
    expect(item.available).toBe(10)
    expectTypeOf(item.productId).toEqualTypeOf<ProductId>()
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
    expect(movement.quantity).toBe(-1)
  })
})

describe('inventory scaffold — contracts (Inventory 2)', () => {
  it('InventoryReader só consulta — getBalance / getBalances', async () => {
    const reader: InventoryReader = {
      async getBalance(productId) {
        return {
          ok: true,
          item: {
            productId,
            lojaId: 'l1',
            quantity: 0,
            available: 0,
          },
        }
      },
      async getBalances(productIds) {
        return {
          ok: true,
          items: productIds.map((productId) => ({
            productId,
            lojaId: 'l1',
            quantity: 0,
            available: 0,
          })),
        }
      },
    }
    expectTypeOf(reader.getBalance).toBeFunction()
    expectTypeOf(reader.getBalances).toBeFunction()
    expect(Object.keys(reader).sort()).toEqual(['getBalance', 'getBalances'])
    await expect(reader.getBalance('p1')).resolves.toMatchObject({ ok: true })
  })

  it('InventoryMovementWriter.registerMovement tipa comando (sem implementação)', async () => {
    const command: RegisterMovementCommand = {
      productId: 'p1',
      lojaId: 'l1',
      type: 'ENTRADA_AJUSTE',
      quantity: 2,
      reason: 'scaffold',
    }
    const writer: InventoryMovementWriter = {
      async registerMovement() {
        return { ok: false, error: 'not wired' }
      },
    }
    expect(Object.keys(writer)).toEqual(['registerMovement'])
    await expect(writer.registerMovement(command)).resolves.toEqual({
      ok: false,
      error: 'not wired',
    })
  })

  it('InventoryAdjustmentService.adjustInventory tipa comando (sem lógica)', async () => {
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
    expect(Object.keys(svc)).toEqual(['adjustInventory'])
    await expect(svc.adjustInventory(command)).resolves.toEqual({
      ok: false,
      error: 'not wired',
    })
  })
})

describe('inventory scaffold — barrel exports', () => {
  it('reexporta tipos/contratos sem side effects de Supabase', async () => {
    const mod = await import('./index')
    expect(mod).toBeDefined()
    // Scaffold só exporta types — nenhum valor runtime além do módulo.
    expect(Object.keys(mod).filter((k) => typeof (mod as Record<string, unknown>)[k] === 'function')).toEqual(
      [],
    )
  })
})
