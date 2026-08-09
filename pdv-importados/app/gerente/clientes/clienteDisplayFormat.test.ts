import { describe, expect, it } from 'vitest'
import {
  formatContagemClientes,
  maskDocumentoDisplay,
  maskTelefoneDisplay,
  maskTelefoneInput,
} from './clienteDisplayFormat'

describe('maskTelefoneDisplay', () => {
  it('formata celular 11 dígitos', () => {
    expect(maskTelefoneDisplay('81988645999')).toBe('(81) 9 8864-5999')
  })

  it('formata fixo 10 dígitos', () => {
    expect(maskTelefoneDisplay('8133334444')).toBe('(81) 3333-4444')
  })

  it('não deixa 12 dígitos ilegíveis e preserva os dígitos', () => {
    const shown = maskTelefoneDisplay('819886459993')
    expect(shown.replace(/\D/g, '')).toBe('819886459993')
    expect(shown).toContain(' ')
    expect(shown).not.toBe('819886459993')
  })

  it('formata 13 dígitos com DDI 55', () => {
    expect(maskTelefoneDisplay('5581988645999')).toBe('+55 (81) 9 8864-5999')
  })

  it('espaça comprimentos atípicos sem alterar dígitos', () => {
    const raw = '8198864599934'
    const shown = maskTelefoneDisplay(raw)
    expect(shown.replace(/\D/g, '')).toBe(raw)
    expect(shown).toContain(' ')
  })

  it('retorna traço para vazio', () => {
    expect(maskTelefoneDisplay(null)).toBe('—')
    expect(maskTelefoneDisplay('')).toBe('—')
  })
})

describe('maskDocumentoDisplay', () => {
  it('mascara CPF e CNPJ', () => {
    expect(maskDocumentoDisplay('99999988852')).toBe('999.999.888-52')
    expect(maskDocumentoDisplay('12345678000199')).toBe('12.345.678/0001-99')
  })
})

describe('maskTelefoneInput', () => {
  it('não trunca telefone persistido com mais de 11 dígitos', () => {
    const shown = maskTelefoneInput('819886459993')
    expect(shown.replace(/\D/g, '')).toBe('819886459993')
  })

  it('formata celular 11 dígitos ao digitar', () => {
    expect(maskTelefoneInput('81988645999')).toBe('(81) 9 8864-5999')
  })
})

describe('formatContagemClientes', () => {
  const labels = {
    um: 'cliente',
    muitos: 'clientes',
    mostrando: 'Mostrando {{n}} {{label}}',
    parcial: 'Mostrando {{n}}+ {{label}}',
  }

  it('pluraliza e marca hasMore', () => {
    expect(formatContagemClientes(1, false, labels)).toBe('Mostrando 1 cliente')
    expect(formatContagemClientes(2, false, labels)).toBe('Mostrando 2 clientes')
    expect(formatContagemClientes(20, true, labels)).toBe('Mostrando 20+ clientes')
  })
})
