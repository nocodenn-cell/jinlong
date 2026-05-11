import { describe, expect, it } from 'vitest'
import {
  validarCelularVendedorOpcional,
  validarCodigoVendedor,
  validarCpfVendedorOpcional,
  validarNomeVendedor,
} from './actions.validation'

describe('actions.validation vendedores', () => {
  it('validarCodigoVendedor', () => {
    expect(validarCodigoVendedor('')).toBe('Código obrigatório')
    expect(validarCodigoVendedor(' V01 ')).toBeNull()
  })

  it('validarNomeVendedor', () => {
    expect(validarNomeVendedor('  ')).toBe('Nome obrigatório')
    expect(validarNomeVendedor('Maria')).toBeNull()
  })

  it('validarCpfVendedorOpcional', () => {
    expect(validarCpfVendedorOpcional('')).toBeNull()
    expect(validarCpfVendedorOpcional('123')).toMatch(/11 dígitos/)
    expect(validarCpfVendedorOpcional('529.982.247-25')).toBeNull()
  })

  it('validarCelularVendedorOpcional', () => {
    expect(validarCelularVendedorOpcional('')).toBeNull()
    expect(validarCelularVendedorOpcional('11999999999')).toBeNull()
    expect(validarCelularVendedorOpcional('12345')).toMatch(/10 e 13/)
  })
})
