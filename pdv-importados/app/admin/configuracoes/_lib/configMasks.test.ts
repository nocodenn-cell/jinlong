import { describe, expect, it } from 'vitest'
import { digitsOnly, maskCep, maskCnpj, maskTel } from './configMasks'

describe('configMasks', () => {
  it('maskCnpj formata 14 dígitos', () => {
    expect(maskCnpj('12345678000199')).toBe('12.345.678/0001-99')
  })

  it('maskTel formata celular', () => {
    expect(maskTel('11987654321')).toBe('(11) 9 8765-4321')
  })

  it('maskCep formata 8 dígitos', () => {
    expect(maskCep('01310100')).toBe('01310-100')
  })

  it('digitsOnly limita tamanho', () => {
    expect(digitsOnly('ab12cd345', 4)).toBe('1234')
  })

  it('aceita null/undefined sem lançar (loja sem CNPJ cadastrado)', () => {
    expect(digitsOnly(null)).toBe('')
    expect(digitsOnly(undefined, 4)).toBe('')
    expect(maskCnpj(null)).toBe('')
    expect(maskTel(undefined)).toBe('')
    expect(maskCep(null)).toBe('')
  })
})
