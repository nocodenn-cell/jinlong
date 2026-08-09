import { describe, expect, it } from 'vitest'
import {
  filtrosFornecedorAtivos,
  fornecedorTemEndereco,
  montarTituloContagem,
} from './fornecedoresListUi'

describe('fornecedoresListUi', () => {
  it('detecta filtros ativos por termo ou status', () => {
    expect(filtrosFornecedorAtivos('', 'todos')).toBe(false)
    expect(filtrosFornecedorAtivos('  ', 'todos')).toBe(false)
    expect(filtrosFornecedorAtivos('acme', 'todos')).toBe(true)
    expect(filtrosFornecedorAtivos('', 'ativos')).toBe(true)
  })

  it('monta contagem honesta sem total de servidor', () => {
    expect(
      montarTituloContagem(0, false, { mostrando: 'Mostrando {n}', ha_mais: 'há mais' }),
    ).toBe('Mostrando 0')
    expect(
      montarTituloContagem(20, true, { mostrando: 'Mostrando {n}', ha_mais: 'há mais' }),
    ).toBe('Mostrando 20 · há mais')
  })

  it('detecta endereço preenchido', () => {
    expect(fornecedorTemEndereco({})).toBe(false)
    expect(fornecedorTemEndereco({ endereco_cidade: 'São Paulo' })).toBe(true)
    expect(fornecedorTemEndereco({ endereco_cep: '01001000' })).toBe(true)
  })
})
