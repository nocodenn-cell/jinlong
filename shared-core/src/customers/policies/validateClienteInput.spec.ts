import { describe, expect, it } from 'vitest'
import { CUSTOMER_ERROR_CODES } from '../errorCodes'
import type { ClienteInput } from '../types'
import { validateClienteInput } from './validateClienteInput'

function baseInput(overrides: Partial<ClienteInput> = {}): ClienteInput {
  return {
    nome: 'Maria Silva',
    tipo: 'PF',
    documento: '12345678901',
    email: null,
    telefone: null,
    endereco: null,
    limite_crediario: 0,
    ...overrides,
  }
}

describe('validateClienteInput', () => {
  it('aceita PF válido com 11 dígitos', () => {
    expect(validateClienteInput(baseInput())).toEqual({ ok: true })
  })

  it('aceita PJ válido com 14 dígitos', () => {
    expect(
      validateClienteInput(
        baseInput({ tipo: 'PJ', documento: '12345678901234', nome: 'Loja LTDA' }),
      ),
    ).toEqual({ ok: true })
  })

  it('aceita documento com máscara (normaliza dígitos)', () => {
    expect(validateClienteInput(baseInput({ documento: '123.456.789-01' }))).toEqual({
      ok: true,
    })
  })

  it('rejeita nome curto — code + mensagem legada', () => {
    expect(validateClienteInput(baseInput({ nome: 'A' }))).toEqual({
      ok: false,
      code: CUSTOMER_ERROR_CODES.NAME_INVALID,
      error: 'Nome inválido.',
    })
    expect(validateClienteInput(baseInput({ nome: '  ' }))).toEqual({
      ok: false,
      code: CUSTOMER_ERROR_CODES.NAME_INVALID,
      error: 'Nome inválido.',
    })
  })

  it('rejeita CPF com tamanho errado — code + mensagem legada', () => {
    expect(validateClienteInput(baseInput({ documento: '123' }))).toEqual({
      ok: false,
      code: CUSTOMER_ERROR_CODES.CPF_INVALID,
      error: 'CPF deve ter 11 dígitos.',
    })
  })

  it('rejeita CNPJ com tamanho errado — code + mensagem legada', () => {
    expect(
      validateClienteInput(baseInput({ tipo: 'PJ', documento: '12345678901' })),
    ).toEqual({
      ok: false,
      code: CUSTOMER_ERROR_CODES.CNPJ_INVALID,
      error: 'CNPJ deve ter 14 dígitos.',
    })
  })

  it('rejeita e-mail inválido — code + mensagem legada', () => {
    expect(validateClienteInput(baseInput({ email: 'nao-email' }))).toEqual({
      ok: false,
      code: CUSTOMER_ERROR_CODES.EMAIL_INVALID,
      error: 'E-mail inválido.',
    })
  })

  it('aceita e-mail válido quando informado', () => {
    expect(validateClienteInput(baseInput({ email: 'a@b.co' }))).toEqual({ ok: true })
  })

  it('rejeita limite negativo — code + mensagem legada', () => {
    expect(validateClienteInput(baseInput({ limite_crediario: -0.01 }))).toEqual({
      ok: false,
      code: CUSTOMER_ERROR_CODES.LIMIT_NEGATIVE,
      error: 'Limite não pode ser negativo.',
    })
  })

  it('aceita limite zero', () => {
    expect(validateClienteInput(baseInput({ limite_crediario: 0 }))).toEqual({ ok: true })
  })
})
