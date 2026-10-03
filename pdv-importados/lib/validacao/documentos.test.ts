import { describe, expect, it } from 'vitest'
import { cnpjDvValido, eanComDvSuspeito, eanDvValido, nomeJaExiste } from './documentos'

describe('cnpjDvValido', () => {
  it('aceita CNPJ real e máscara', () => {
    expect(cnpjDvValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjDvValido('11222333000181')).toBe(true)
  })
  it('rejeita DV errado, sequência repetida e tamanho errado (dados de teste da auditoria)', () => {
    expect(cnpjDvValido('11.222.333/0001-82')).toBe(false)
    expect(cnpjDvValido('77.777.777/7777-77')).toBe(false)
    expect(cnpjDvValido('00.000.000/0000-00')).toBe(false)
    expect(cnpjDvValido('123')).toBe(false)
  })
})

describe('eanDvValido / eanComDvSuspeito', () => {
  it('EAN-13 e EAN-8 válidos', () => {
    expect(eanDvValido('7891000100103')).toBe(true)
    expect(eanDvValido('96385074')).toBe(true)
  })
  it('EAN-13 com DV errado gera suspeita', () => {
    expect(eanDvValido('7891000100104')).toBe(false)
    expect(eanComDvSuspeito('7891000100104')).toBe(true)
    expect(eanComDvSuspeito('1651651651651616')).toBe(false) // 16 dígitos: não parece EAN
  })
  it('códigos internos não geram aviso', () => {
    for (const c of ['camisa branca', '62.62.62.2.62', 'ABC123', '', null, undefined]) {
      expect(eanComDvSuspeito(c as string)).toBe(false)
    }
  })
})

describe('nomeJaExiste', () => {
  it('ignora caixa, acento e espaços', () => {
    expect(nomeJaExiste('  caneta  AZUL ', ['Caneta Azul'])).toBe(true)
    expect(nomeJaExiste('Papel & Cia', ['papel & cia'])).toBe(true)
    expect(nomeJaExiste('Açúcar', ['acucar'])).toBe(true)
  })
  it('nome diferente ou curto não conta; o próprio registro em edição é ignorado', () => {
    expect(nomeJaExiste('Caneta', ['Caneta Azul'])).toBe(false)
    expect(nomeJaExiste('a', ['a'])).toBe(false)
    expect(nomeJaExiste('Acme', ['Acme'], 'Acme')).toBe(false)
  })
})
