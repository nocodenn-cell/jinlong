import { describe, expect, it } from 'vitest'
import { INVENTORY_ERROR_CODES } from '../errorCodes'
import { validateAdjustInventoryCommand } from './validateAdjustInventory'

const base = {
  productId: 'p1',
  lojaId: 'l1',
  quantity: 5,
  reason: 'ACERTO_INVENTARIO',
}

describe('validateAdjustInventoryCommand', () => {
  it('aceita ajuste válido', () => {
    const r = validateAdjustInventoryCommand(base)
    expect(r.ok).toBe(true)
  })

  it('rejeita quantidade negativa', () => {
    const r = validateAdjustInventoryCommand({ ...base, quantity: -1 })
    expect(r).toEqual({ ok: false, code: INVENTORY_ERROR_CODES.QTY_INVALID })
  })

  it('rejeita motivo inválido', () => {
    const r = validateAdjustInventoryCommand({ ...base, reason: 'FOO' })
    expect(r).toEqual({ ok: false, code: INVENTORY_ERROR_CODES.REASON_INVALID })
  })

  it('OUTRO exige observação', () => {
    const r = validateAdjustInventoryCommand({
      ...base,
      reason: 'OUTRO',
      observacao: '   ',
    })
    expect(r).toEqual({ ok: false, code: INVENTORY_ERROR_CODES.OBS_REQUIRED })
  })

  it('OUTRO com observação passa', () => {
    const r = validateAdjustInventoryCommand({
      ...base,
      reason: 'OUTRO',
      observacao: 'correção',
    })
    expect(r.ok).toBe(true)
  })
})
