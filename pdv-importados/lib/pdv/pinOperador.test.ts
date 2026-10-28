import { describe, expect, it } from 'vitest'
import { derivarPinHash, validarPinNovo } from './pinOperador'

describe('PIN do operador', () => {
  it('recusa formato, óbvios e confirmação diferente', () => {
    expect(validarPinNovo('123', '123')).toBe('formato')
    expect(validarPinNovo('12a4', '12a4')).toBe('formato')
    expect(validarPinNovo('1234', '1234')).toBe('obvio')
    expect(validarPinNovo('0000', '0000')).toBe('obvio')
    expect(validarPinNovo('7391', '7392')).toBe('confirmacao')
    expect(validarPinNovo('7391', '7391')).toBeNull()
  })
  it('PBKDF2-SHA256 igual ao vetor de referência e ao PDV/Edge', () => {
    const salt = Buffer.from('salt').toString('hex')
    expect(derivarPinHash('passwd', salt, 1).hash).toBe('55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc')
    const r = derivarPinHash('7391')
    expect(r.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(r.iteracoes).toBeGreaterThanOrEqual(100_000)
  })
})
