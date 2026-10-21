import { describe, expect, it } from 'vitest'
import { erroDoFragmento, parseEmailOtpType, safeAuthNextPath } from './emailLink'

describe('emailLink', () => {
  it('aceita só tipos conhecidos', () => {
    expect(parseEmailOtpType('recovery')).toBe('recovery')
    expect(parseEmailOtpType('invite')).toBe('invite')
    expect(parseEmailOtpType('x')).toBeNull()
    expect(parseEmailOtpType(null)).toBeNull()
  })
  it('bloqueia redirecionamento externo', () => {
    expect(safeAuthNextPath('//evil.com')).toBe('/auth/redefinir-senha')
    expect(safeAuthNextPath('https://evil.com')).toBe('/auth/redefinir-senha')
    expect(safeAuthNextPath('/\\evil.com')).toBe('/auth/redefinir-senha')
    expect(safeAuthNextPath('/outra')).toBe('/auth/redefinir-senha')
    expect(safeAuthNextPath('/admin')).toBe('/admin')
    expect(safeAuthNextPath(null)).toBe('/auth/redefinir-senha')
  })
  it('lê erro do fragmento', () => {
    expect(erroDoFragmento('#error=access_denied&error_code=otp_expired&error_description=x')).toBe('link_expirado')
    expect(erroDoFragmento('#error=access_denied')).toBe('link_invalido')
    expect(erroDoFragmento('#access_token=abc')).toBeNull()
    expect(erroDoFragmento('')).toBeNull()
  })
})
