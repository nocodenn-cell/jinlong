import { describe, expect, it } from 'vitest'
import { CUSTOMER_ERROR_CODES } from '@shared-core/src/customers'
import { localizeCustomerFailure, resolveCustomerMessage } from './customerMessages'

describe('customerMessages — i18n borda (5.3)', () => {
  it('PT: code de validação → catálogo pt', () => {
    expect(resolveCustomerMessage('pt', CUSTOMER_ERROR_CODES.NAME_INVALID)).toBe(
      'Nome inválido.',
    )
    expect(resolveCustomerMessage('pt-BR', CUSTOMER_ERROR_CODES.CPF_INVALID)).toBe(
      'CPF deve ter 11 dígitos.',
    )
  })

  it('ZH: code → catálogo zh-CN', () => {
    const nome = resolveCustomerMessage('zh', CUSTOMER_ERROR_CODES.NAME_INVALID)
    expect(nome).not.toBe('Nome inválido.')
    expect(nome.length).toBeGreaterThan(0)

    const email = resolveCustomerMessage('zh-CN', CUSTOMER_ERROR_CODES.EMAIL_INVALID)
    expect(email).not.toBe('E-mail inválido.')
  })

  it('crediário aberto interpola {{nome}}', () => {
    const pt = resolveCustomerMessage('pt', CUSTOMER_ERROR_CODES.HAS_OPEN_CREDIT, {
      nome: 'Ana',
    })
    expect(pt).toContain('Ana')
    expect(pt).toContain('crediário')

    const zh = resolveCustomerMessage('zh', CUSTOMER_ERROR_CODES.HAS_OPEN_CREDIT, {
      nome: 'Ana',
    })
    expect(zh).toContain('Ana')
    expect(zh).not.toBe(pt)
  })

  it('fallback en-US → pt-BR', () => {
    expect(resolveCustomerMessage('en-US', CUSTOMER_ERROR_CODES.NOT_FOUND)).toBe(
      'Cliente não encontrado.',
    )
  })

  it('localizeCustomerFailure usa code quando presente', () => {
    expect(
      localizeCustomerFailure('zh', {
        error: 'Nome inválido.',
        code: CUSTOMER_ERROR_CODES.NAME_INVALID,
      }),
    ).toEqual({
      ok: false,
      error: resolveCustomerMessage('zh', CUSTOMER_ERROR_CODES.NAME_INVALID),
    })
  })

  it('localizeCustomerFailure preserva error sem code (infra)', () => {
    expect(
      localizeCustomerFailure('zh', { error: 'duplicate key value' }),
    ).toEqual({ ok: false, error: 'duplicate key value' })
  })
})
