import { describe, expect, it } from 'vitest'
import {
  somenteDigitos,
  validarCnpjFornecedor,
  validarDocumentoClienteOpcional,
  validarNomeContato,
} from './actions.validation'

describe('actions.validation clientes-fornecedores', () => {
  it('somenteDigitos remove não numéricos', () => {
    expect(somenteDigitos('12.345.678/0001-90')).toBe('12345678000190')
  })

  it('validarNomeContato', () => {
    expect(validarNomeContato('')).toBe('Nome obrigatório')
    expect(validarNomeContato('  ACME  ')).toBeNull()
  })

  it('validarDocumentoClienteOpcional aceita vazio', () => {
    expect(validarDocumentoClienteOpcional('')).toBeNull()
    expect(validarDocumentoClienteOpcional(undefined)).toBeNull()
  })

  it('validarDocumentoClienteOpcional exige faixa de dígitos', () => {
    expect(validarDocumentoClienteOpcional('123')).toMatch(/dígitos/)
    expect(validarDocumentoClienteOpcional('12345678901')).toBeNull()
  })

  it('validarCnpjFornecedor', () => {
    expect(validarCnpjFornecedor('')).toMatch(/dígitos/)
    expect(validarCnpjFornecedor('12.762.317/0001-80')).toBeNull()
  })
})
