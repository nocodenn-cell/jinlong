import { describe, expect, it } from 'vitest'
import {
  filtrosFornecedorAtivos,
  maskCnpj,
  montarTituloContagem,
} from './fornecedoresListUi'

describe('fornecedoresListUi', () => {
  it('detecta filtros ativos por termo', () => {
    expect(filtrosFornecedorAtivos('')).toBe(false)
    expect(filtrosFornecedorAtivos('  ')).toBe(false)
    expect(filtrosFornecedorAtivos('acme')).toBe(true)
  })

  it('monta contagem honesta sem total de servidor', () => {
    expect(
      montarTituloContagem(0, false, { mostrando: 'Mostrando {n}', ha_mais: 'há mais' }),
    ).toBe('Mostrando 0')
    expect(
      montarTituloContagem(20, true, { mostrando: 'Mostrando {n}', ha_mais: 'há mais' }),
    ).toBe('Mostrando 20 · há mais')
  })

  it('mascara CNPJ progressivamente', () => {
    expect(maskCnpj('12345678000199')).toBe('12.345.678/0001-99')
    expect(maskCnpj('12')).toBe('12')
  })
})
