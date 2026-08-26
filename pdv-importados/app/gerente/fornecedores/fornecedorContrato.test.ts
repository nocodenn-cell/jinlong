import { describe, expect, it } from 'vitest'
import {
  FORNECEDOR_COLUNAS_FANTASMA,
  FORNECEDOR_SELECT_COLUMNS,
  normalizarCnpj,
  selectContemColunaFantasma,
  validarFornecedorInput,
} from './fornecedorContrato'

describe('fornecedorContrato', () => {
  it('normaliza CNPJ removendo máscara', () => {
    expect(normalizarCnpj('12.345.678/0001-99')).toBe('12345678000199')
    expect(normalizarCnpj(' 123 ')).toBe('123')
  })

  it('valida nome e CNPJ de 14 dígitos', () => {
    expect(validarFornecedorInput({ nome: 'A', cnpj: '12345678000199' })).toMatch(/Nome/)
    expect(validarFornecedorInput({ nome: 'Acme', cnpj: '123' })).toMatch(/CNPJ/)
    expect(validarFornecedorInput({ nome: 'Acme', cnpj: '12.345.678/0001-99' })).toBeNull()
  })

  it('SELECT canônico não contém colunas fantasma', () => {
    expect(selectContemColunaFantasma(FORNECEDOR_SELECT_COLUMNS)).toBeNull()
    for (const col of FORNECEDOR_COLUNAS_FANTASMA) {
      expect(selectContemColunaFantasma(`${FORNECEDOR_SELECT_COLUMNS}, ${col}`)).toBe(col)
    }
  })
})
