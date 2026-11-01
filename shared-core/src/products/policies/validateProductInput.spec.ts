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

  it('ATACADO_INVALID quando atacado >= varejo na criação (CSV/lote bypassam o Zod do formulário)', () => {
    expect(
      validateCreateProductCommand({
        input: { nome: 'Ok', precoVarejo: 10, precoAtacado: 15 },
        lojaId: 'l1',
        atorId: 'u1',
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.ATACADO_INVALID })
    expect(
      validateCreateProductCommand({
        input: { nome: 'Ok', precoVarejo: 10, precoAtacado: 10 },
        lojaId: 'l1',
        atorId: 'u1',
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.ATACADO_INVALID })
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

describe('limites de moeda e estoque (camada de domínio)', () => {
  const base = { nome: 'Ok', lojaId: 'l1', atorId: 'u1' }

  it('rejeita preço com mais de 2 casas (não arredonda no banco)', () => {
    expect(
      validateCreateProductCommand({ ...base, input: { nome: 'Ok', precoVarejo: 2.005 } }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.PRICE_INVALID })
    expect(
      validateUpdateProductCommand({
        id: 'p1',
        lojaId: 'l1',
        input: { nome: 'Ok', precoVarejo: 10.999 },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.PRICE_NOT_POSITIVE })
  })

  it('rejeita preço acima de numeric(10,2)', () => {
    expect(
      validateCreateProductCommand({ ...base, input: { nome: 'Ok', precoVarejo: 1e8 } }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.PRICE_INVALID })
  })

  it('rejeita NaN e Infinity em preço e atacado', () => {
    expect(
      validateCreateProductCommand({ ...base, input: { nome: 'Ok', precoVarejo: Number.NaN } }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.PRICE_INVALID })
    expect(
      validateCreateProductCommand({
        ...base,
        input: { nome: 'Ok', precoVarejo: 10, precoAtacado: Number.POSITIVE_INFINITY },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.PRICE_INVALID })
  })

  it('aceita preço com 2 casas no limite', () => {
    expect(
      validateCreateProductCommand({ ...base, input: { nome: 'Ok', precoVarejo: 99999999.99 } }),
    ).toEqual({ ok: true })
  })

  it('rejeita estoque inicial acima do teto de entrada', () => {
    expect(
      validateCreateProductCommand({
        ...base,
        input: { nome: 'Ok', precoVarejo: 1, estoqueInicial: 10_000_000 },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.ESTOQUE_INVALID })
  })
})

describe('estoque inicial por unidade de medida', () => {
  const base = { nome: 'Ok', precoVarejo: 1, lojaId: 'l1', atorId: 'u1' }

  it('UN aceita só inteiro: 0,5 é rejeitado', () => {
    expect(
      validateCreateProductCommand({
        ...base,
        input: { nome: 'Ok', precoVarejo: 1, estoqueInicial: 0.5, unidadeMedida: 'UN' },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.ESTOQUE_INVALID })
  })

  it('KG aceita fração de até 3 casas (0,500)', () => {
    expect(
      validateCreateProductCommand({
        ...base,
        input: { nome: 'Ok', precoVarejo: 1, estoqueInicial: 0.5, unidadeMedida: 'KG' },
      }),
    ).toEqual({ ok: true })
  })

  it('KG rejeita mais de 3 casas', () => {
    expect(
      validateCreateProductCommand({
        ...base,
        input: { nome: 'Ok', precoVarejo: 1, estoqueInicial: 0.0005, unidadeMedida: 'KG' },
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.ESTOQUE_INVALID })
  })
})
