import { describe, expect, it } from 'vitest'
import { PASSWORD_MIN_LENGTH, validateNewPassword } from './passwordPolicy'

describe('validateNewPassword', () => {
  it('rejeita vazia', () => {
    expect(validateNewPassword('', '')).toEqual({ ok: false, code: 'EMPTY' })
  })

  it('rejeita curta', () => {
    expect(validateNewPassword('1234567', '1234567')).toEqual({ ok: false, code: 'TOO_SHORT' })
  })

  it('rejeita confirmação diferente', () => {
    expect(validateNewPassword('senha1234', 'senha9999')).toEqual({ ok: false, code: 'MISMATCH' })
  })

  it('aceita senha válida', () => {
    const p = 'a'.repeat(PASSWORD_MIN_LENGTH)
    expect(validateNewPassword(p, p)).toEqual({ ok: true })
  })
})
