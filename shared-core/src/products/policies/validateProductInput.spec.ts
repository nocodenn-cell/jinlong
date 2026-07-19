import { describe, expect, it } from 'vitest'
import { PRODUCT_ERROR_CODES } from '../errorCodes'
import {
  validateCreateProductCommand,
  validateUpdateProductCommand,
} from './validateProductInput'

describe('validateCreateProductCommand', () => {
  it('ok com payload mínimo válido', () => {
    expect(
      validateCreateProductCommand({
        input: { nome: 'Ok', precoVarejo: 0 },
        lojaId: 'l1',
        atorId: 'u1',
      }),
    ).toEqual({ ok: true })
  })

  it('emite codes sem string PT', () => {
    const r = validateCreateProductCommand({
      input: { nome: 'A', precoVarejo: 1 },
      lojaId: 'l1',
      atorId: 'u1',
    })
    expect(r).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.NAME_INVALID })
    expect(r).not.toHaveProperty('error')
  })

  it('PRICE_INVALID quando preço negativo', () => {
    expect(
      validateCreateProductCommand({
        input: { nome: 'Ok', precoVarejo: -1 },
        lojaId: 'l1',
        atorId: 'u1',
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.PRICE_INVALID })
  })

  it('AUTH_REQUIRED / LOJA_REQUIRED / ESTOQUE_INVALID', () => {
    expect(
      validateCreateProductCommand({
        input: { nome: 'Ok', precoVarejo: 1 },
        lojaId: 'l1',
        atorId: '',
      }).ok,
    ).toBe(false)
    expect(
      validateCreateProductCommand({
        input: { nome: 'Ok', precoVarejo: 1 },
        lojaId: '',
        atorId: 'u1',
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.LOJA_REQUIRED })
    expect(
      validateCreateProductCommand({
        input: { nome: 'Ok', precoVarejo: 1, estoqueInicial: -2 },
        lojaId: 'l1',
        atorId: 'u1',
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.ESTOQUE_INVALID })
  })
})

describe('validateUpdateProductCommand', () => {
  it('ok com payload válido', () => {
    expect(
      validateUpdateProductCommand({
        id: 'p1',
        lojaId: 'l1',
        input: { nome: 'Ok', precoVarejo: 1 },
      }),
    ).toEqual({ ok: true })
  })

  it('PRICE_NOT_POSITIVE quando preço zero', () => {
    expect(
      validateUpdateProductCommand({
        id: 'p1',
        lojaId: 'l1',
        input: { nome: 'Ok', precoVarejo: 0 },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.PRICE_NOT_POSITIVE })
  })

  it('BARCODE_TOO_SHORT / ATACADO_INVALID / UPDATE_WITHOUT_ID', () => {
    expect(
      validateUpdateProductCommand({
        id: 'p1',
        lojaId: 'l1',
        input: { nome: 'Ok', precoVarejo: 10, codigoBarras: '12' },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.BARCODE_TOO_SHORT })
    expect(
      validateUpdateProductCommand({
        id: 'p1',
        lojaId: 'l1',
        input: { nome: 'Ok', precoVarejo: 10, precoAtacado: 10 },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.ATACADO_INVALID })
    expect(
      validateUpdateProductCommand({
        id: '',
        lojaId: 'l1',
        input: { nome: 'Ok', precoVarejo: 1 },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.UPDATE_WITHOUT_ID })
  })
})
