import { describe, expect, it } from 'vitest'
import { buildItensConferenciaPreenchidos, valorInicialQtdConferida } from './ImportarNfePageClient'
import type { ItemConferenciaNfe } from './actions'

function item(overrides: Partial<ItemConferenciaNfe> = {}): ItemConferenciaNfe {
  return {
    item_id: 'item-1',
    produto_id: 'produto-1',
    produto_nome: 'Produto Teste',
    produto_codigo_barras: null,
    quantidade_nfe: 10,
    custo_unitario: 5,
    atualizar_custo: true,
    quantidade_conferida: null,
    divergencia_obs: null,
    status_conferencia: 'EM_CONFERENCIA',
    ...overrides,
  }
}

describe('buildItensConferenciaPreenchidos (achado de revisão pré-merge — P1 Codex)', () => {
  it('exclui item com campo em branco (nunca usa a quantidade da nota como fallback)', () => {
    const itens = [item({ item_id: 'a' })]
    const r = buildItensConferenciaPreenchidos(itens, { a: '' }, {})
    expect(r).toEqual([])
  })

  it('exclui item com campo ausente do mapa (nunca tocado pelo operador)', () => {
    const itens = [item({ item_id: 'a' })]
    const r = buildItensConferenciaPreenchidos(itens, {}, {})
    expect(r).toEqual([])
  })

  it('exclui item com apenas espaços em branco', () => {
    const itens = [item({ item_id: 'a' })]
    const r = buildItensConferenciaPreenchidos(itens, { a: '   ' }, {})
    expect(r).toEqual([])
  })

  it('inclui item com quantidade explícita, mesmo que igual à da nota', () => {
    const itens = [item({ item_id: 'a', quantidade_nfe: 10 })]
    const r = buildItensConferenciaPreenchidos(itens, { a: '10' }, {})
    expect(r).toEqual([{ item_id: 'a', quantidade_conferida: 10, divergencia_obs: null }])
  })

  it('inclui item com quantidade explícita zero (contei e não veio nada)', () => {
    const itens = [item({ item_id: 'a' })]
    const r = buildItensConferenciaPreenchidos(itens, { a: '0' }, {})
    expect(r).toEqual([{ item_id: 'a', quantidade_conferida: 0, divergencia_obs: null }])
  })

  it('exclui quantidade negativa (input inválido, não uma contagem real)', () => {
    const itens = [item({ item_id: 'a' })]
    const r = buildItensConferenciaPreenchidos(itens, { a: '-3' }, {})
    expect(r).toEqual([])
  })

  it('exclui quantidade não numérica', () => {
    const itens = [item({ item_id: 'a' })]
    const r = buildItensConferenciaPreenchidos(itens, { a: 'abc' }, {})
    expect(r).toEqual([])
  })

  it('anexa a observação de divergência quando presente', () => {
    const itens = [item({ item_id: 'a' })]
    const r = buildItensConferenciaPreenchidos(itens, { a: '8' }, { a: 'faltou uma caixa' })
    expect(r).toEqual([{ item_id: 'a', quantidade_conferida: 8, divergencia_obs: 'faltou uma caixa' }])
  })

  it('mistura itens preenchidos e em branco na mesma chamada — só os preenchidos entram', () => {
    const itens = [item({ item_id: 'a' }), item({ item_id: 'b' }), item({ item_id: 'c' })]
    const r = buildItensConferenciaPreenchidos(itens, { a: '5', c: '' }, {})
    expect(r).toEqual([{ item_id: 'a', quantidade_conferida: 5, divergencia_obs: null }])
  })
})

describe('valorInicialQtdConferida (RM-01 — campo de conferência não pode nascer com a qtd. da nota)', () => {
  it('retorna null (campo vazio) quando o servidor ainda não tem contagem', () => {
    expect(valorInicialQtdConferida({ quantidade_conferida: null })).toBeNull()
  })

  it('retorna a contagem salva ao retomar uma conferência já iniciada, mesmo que seja zero', () => {
    expect(valorInicialQtdConferida({ quantidade_conferida: 7 })).toBe('7')
    expect(valorInicialQtdConferida({ quantidade_conferida: 0 })).toBe('0')
  })

  it('nunca deriva o valor inicial da quantidade da nota', () => {
    const semContagem = { quantidade_conferida: null }
    expect(valorInicialQtdConferida(semContagem)).not.toBe('10')
    expect(valorInicialQtdConferida(semContagem)).toBeNull()
  })
})
