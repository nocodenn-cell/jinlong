import { describe, expect, it } from 'vitest'
import { mapRegraPrecoRow, type RegraPrecoRow } from './mapRegrasPreco'

function makeRow(overrides: Partial<RegraPrecoRow> = {}): RegraPrecoRow {
  return {
    id: 'r1',
    tipo_regra: 'PRODUTO',
    produto_id: 'p1',
    categoria_id: null,
    quantidade_minima: 10,
    quantidade_maxima: 50,
    tipo_desconto: 'PERCENTUAL',
    valor_desconto: 15,
    data_validade: '2025-12-31',
    ativo: true,
    ...overrides,
  }
}

describe('mapRegraPrecoRow', () => {
  it('maps basic fields from row', () => {
    const result = mapRegraPrecoRow(makeRow())
    expect(result.id).toBe('r1')
    expect(result.nome).toBe('PRODUTO')
    expect(result.minQuantidade).toBe(10)
    expect(result.maxQuantidade).toBe(50)
    expect(result.produtoId).toBe('p1')
    expect(result.dataValidade).toBe('2025-12-31')
    expect(result.ativo).toBe(true)
  })

  it('sets tipo VAREJO for PRODUTO rule', () => {
    const result = mapRegraPrecoRow(makeRow({ tipo_regra: 'PRODUTO' }))
    expect(result.tipo).toBe('VAREJO')
  })

  it('sets tipo ATACADO for non-PRODUTO rule', () => {
    const result = mapRegraPrecoRow(makeRow({ tipo_regra: 'CATEGORIA' }))
    expect(result.tipo).toBe('ATACADO')
  })

  it('handles null quantidade_maxima', () => {
    const result = mapRegraPrecoRow(makeRow({ quantidade_maxima: null }))
    expect(result.maxQuantidade).toBeUndefined()
  })

  it('parses string quantities as numbers', () => {
    const result = mapRegraPrecoRow(makeRow({ quantidade_minima: '5', quantidade_maxima: '20' }))
    expect(result.minQuantidade).toBe(5)
    expect(result.maxQuantidade).toBe(20)
  })

  it('maps PERCENTUAL discount', () => {
    const result = mapRegraPrecoRow(makeRow({ tipo_desconto: 'PERCENTUAL', valor_desconto: 10 }))
    expect(result.descontoPercentual).toBe(10)
    expect(result.precoFixo).toBeUndefined()
  })

  it('maps VALOR_FIXO discount', () => {
    const result = mapRegraPrecoRow(makeRow({ tipo_desconto: 'VALOR_FIXO', valor_desconto: 25 }))
    expect(result.precoFixo).toBe(25)
    expect(result.descontoPercentual).toBeUndefined()
  })

  it('maps null produto_id to undefined', () => {
    const result = mapRegraPrecoRow(makeRow({ produto_id: null }))
    expect(result.produtoId).toBeUndefined()
  })

  it('maps categoriaId from categoria_id', () => {
    const result = mapRegraPrecoRow(makeRow({ categoria_id: 'cat1' }))
    expect(result.categoriaId).toBe('cat1')
  })
})
