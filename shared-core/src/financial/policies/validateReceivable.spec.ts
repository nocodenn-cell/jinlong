import { describe, expect, it } from 'vitest'
import { FINANCIAL_ERROR_CODES } from '../errorCodes'
import {
  validateCreateReceivableInput,
  validateLiquidateReceivableInput,
} from './validateReceivable'

describe('validateReceivable', () => {
  it('exige cliente e valor positivo', () => {
    expect(validateCreateReceivableInput({ clienteId: '', valorTotal: 10 })).toMatchObject({
      code: FINANCIAL_ERROR_CODES.CLIENT_REQUIRED,
    })
    expect(validateCreateReceivableInput({ clienteId: 'c1', valorTotal: 0 })).toMatchObject({
      code: FINANCIAL_ERROR_CODES.VALUE_INVALID,
    })
    expect(validateCreateReceivableInput({ clienteId: 'c1', valorTotal: 10 }).ok).toBe(true)
  })

  it('liquidação exige título e valor', () => {
    expect(validateLiquidateReceivableInput({ tituloId: 't1', valor: -1 })).toMatchObject({
      code: FINANCIAL_ERROR_CODES.VALUE_INVALID,
    })
    expect(validateLiquidateReceivableInput({ tituloId: 't1', valor: 5 }).ok).toBe(true)
  })
})
