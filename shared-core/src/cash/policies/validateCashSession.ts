import { CASH_ERROR_CODES, type CashErrorCode } from '../errorCodes'

export type ValidateCashResult =
  | { ok: true }
  | { ok: false; code: CashErrorCode }

/** Valor inicial / contado — espelho de parseMoneyInput > null e ≥ 0. */
export function validateCashMoneyValue(value: number): ValidateCashResult {
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, code: CASH_ERROR_CODES.VALUE_INVALID }
  }
  return { ok: true }
}

export function validateCloseMotivo(motivo: string, maxLen = 500): ValidateCashResult {
  if (motivo.length > maxLen) {
    return { ok: false, code: CASH_ERROR_CODES.MOTIVO_TOO_LONG }
  }
  return { ok: true }
}

export function validateMovementInput(input: {
  valor: number
  motivo: string
  idempotencyKey: string
}): ValidateCashResult {
  if (!Number.isFinite(input.valor) || input.valor <= 0) {
    return { ok: false, code: CASH_ERROR_CODES.VALUE_INVALID }
  }
  if ((input.motivo ?? '').trim().length < 2) {
    return { ok: false, code: CASH_ERROR_CODES.MOTIVO_REQUIRED }
  }
  if (!(input.idempotencyKey ?? '').trim()) {
    return { ok: false, code: CASH_ERROR_CODES.IDEMPOTENCY_REQUIRED }
  }
  return { ok: true }
}
