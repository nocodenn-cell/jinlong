import { describe, expect, it } from 'vitest'
import { mapRegraPrecoRow } from '@core/caixa/mapRegrasPreco'

/**
 * Parsing de linhas `regras_preco` como vêm do Postgres (strings numéricas).
 */
describe('mapRegraPrecoRow (sync catálogo)', () => {
  it('converte quantidades e valores em string para número', () => {
    const r = mapRegraPrecoRow({
      id: 'r-1',
      tipo_regra: 'PRODUTO',
      produto_id: 'p-1',
      categoria_id: null,
      quantidade_minima: '2',
      quantidade_maxima: '10',
      tipo_desconto: 'PERCENTUAL',
      valor_desconto: '5.5',
      data_validade: null,
      ativo: true,
    })
    expect(r.quantidadeMinima).toBe(2)
    expect(r.quantidadeMaxima).toBe(10)
    expect(r.valorDesconto).toBe(5.5)
    expect(r.produtoId).toBe('p-1')
  })

  it('trata quantidade_maxima null como indefinido', () => {
    const r = mapRegraPrecoRow({
      id: 'r-2',
      tipo_regra: 'CATEGORIA',
      produto_id: null,
      categoria_id: 'c-1',
      quantidade_minima: 1,
      quantidade_maxima: null,
      tipo_desconto: 'VALOR_FIXO',
      valor_desconto: 2,
      data_validade: '2026-12-31',
      ativo: false,
    })
    expect(r.quantidadeMaxima).toBeUndefined()
    expect(r.ativo).toBe(false)
    expect(r.dataValidade).toBe('2026-12-31')
  })

  it('normaliza caixa/espaços dos discriminadores (SQLite offline não tem CHECK)', () => {
    // O CHECK do Postgres garante uppercase online, mas a cópia sincronizada em
    // SQLite não — e o PricingService compara `tipo` por igualdade exata. Sem a
    // normalização no mapper, 'produto ' viraria ATACADO (não-match silencioso).
    const r = mapRegraPrecoRow({
      id: 'r-3',
      tipo_regra: 'produto ',
      produto_id: 'p-3',
      categoria_id: null,
      quantidade_minima: 1,
      quantidade_maxima: null,
      tipo_desconto: ' percentual',
      valor_desconto: 10,
      data_validade: null,
      ativo: true,
    })
    expect(r.tipo).toBe('VAREJO')
    expect(r.descontoPercentual).toBe(10)
    expect(r.precoFixo).toBeUndefined()
  })
})
