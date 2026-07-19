import { FINANCIAL_ERROR_CODES, type FinancialErrorCode } from '../errorCodes'

export type ValidateFinancialResult =
  | { ok: true }
  | { ok: false; code: FinancialErrorCode; error: string }

/** Espelho de `validarCriarTituloInput` — codes + mensagem PT legada. */
export function validateCreateReceivableInput(input: {
  clienteId: string
  valorTotal: number
}): ValidateFinancialResult {
  if (!input.clienteId?.trim()) {
    return {
      ok: false,
      code: FINANCIAL_ERROR_CODES.CLIENT_REQUIRED,
      error: 'Cliente obrigatório',
    }
  }
  if (!Number.isFinite(input.valorTotal) || input.valorTotal <= 0) {
    return {
      ok: false,
      code: FINANCIAL_ERROR_CODES.VALUE_INVALID,
      error: 'Valor inválido',
    }
  }
  return { ok: true }
}

export function validateLiquidateReceivableInput(input: {
  tituloId: string
  valor: number
}): ValidateFinancialResult {
  if (!input.tituloId?.trim()) {
    return {
      ok: false,
      code: FINANCIAL_ERROR_CODES.TITLE_REQUIRED,
      error: 'Título obrigatório',
    }
  }
  if (!Number.isFinite(input.valor) || input.valor <= 0) {
    return {
      ok: false,
      code: FINANCIAL_ERROR_CODES.VALUE_INVALID,
      error: 'Valor inválido para liquidação',
    }
  }
  return { ok: true }
}
