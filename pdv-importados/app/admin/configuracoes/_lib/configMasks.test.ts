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

  it('digitsOnly trata null como vazio (loja.cnpj pode vir null do banco)', () => {
    expect(digitsOnly(null)).toBe('')
  })

  it('digitsOnly trata undefined como vazio', () => {
    expect(digitsOnly(undefined)).toBe('')
  })

  it('maskCnpj não quebra quando o CNPJ da loja é null', () => {
    expect(maskCnpj(null)).toBe('')
  })

  it('maskTel não quebra quando o telefone é undefined', () => {
    expect(maskTel(undefined)).toBe('')
  })

  it('maskCep não quebra quando o CEP é null', () => {
    expect(maskCep(null)).toBe('')
  })
})
