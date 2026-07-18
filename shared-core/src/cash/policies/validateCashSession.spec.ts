import { describe, expect, it } from 'vitest'
import { CASH_ERROR_CODES } from '../errorCodes'
import {
  validateCashMoneyValue,
  validateCloseMotivo,
  validateMovementInput,
} from './validateCashSession'

describe('cash policies', () => {
  it('rejeita valor negativo', () => {
    expect(validateCashMoneyValue(-1)).toEqual({
      ok: false,
      code: CASH_ERROR_CODES.VALUE_INVALID,
    })
  })

  it('aceita valor zero de abertura', () => {
    expect(validateCashMoneyValue(0).ok).toBe(true)
  })

  it('movimentação exige motivo e idempotency', () => {
    expect(
      validateMovementInput({ valor: 10, motivo: 'x', idempotencyKey: 'k' }),
    ).toEqual({ ok: false, code: CASH_ERROR_CODES.MOTIVO_REQUIRED })
    expect(
      validateMovementInput({ valor: 10, motivo: 'ok', idempotencyKey: '' }),
    ).toEqual({ ok: false, code: CASH_ERROR_CODES.IDEMPOTENCY_REQUIRED })
    expect(
      validateMovementInput({ valor: 10, motivo: 'ok', idempotencyKey: 'k1' }).ok,
    ).toBe(true)
  })

  it('motivo de fechamento tem teto', () => {
    expect(validateCloseMotivo('a'.repeat(501))).toEqual({
      ok: false,
      code: CASH_ERROR_CODES.MOTIVO_TOO_LONG,
    })
  })
})
