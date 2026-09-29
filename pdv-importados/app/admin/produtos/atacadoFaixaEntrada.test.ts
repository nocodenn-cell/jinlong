import { describe, expect, it } from 'vitest'
import { resumirFaixasAtacado, type FaixaAtacadoAtiva } from './atacadoFaixaEntrada'

const f = (over: Partial<FaixaAtacadoAtiva> & { produto_id: string }): FaixaAtacadoAtiva => ({
  quantidade_minima: 10,
  preco_unitario: 5,
  loja_id: null,
  ...over,
})

describe('resumirFaixasAtacado — faixa de entrada do Catálogo', () => {
  it('uma faixa: entrada = ela, sem faixas adicionais', () => {
    const r = resumirFaixasAtacado(
      [f({ produto_id: 'p1', quantidade_minima: 6, preco_unitario: 30 })],
      null,
    )
    expect(r.get('p1')).toEqual({ quantidadeMinima: 6, precoUnitario: 30, faixasAdicionais: 0 })
  })

  it('várias faixas: entrada = MENOR quantidade mínima, não o menor preço', () => {
    const r = resumirFaixasAtacado(
      [
        f({ produto_id: 'p1', quantidade_minima: 50, preco_unitario: 4 }),
        f({ produto_id: 'p1', quantidade_minima: 10, preco_unitario: 9 }),
        f({ produto_id: 'p1', quantidade_minima: 20, preco_unitario: 7 }),
      ],
      null,
    )
    // O menor PREÇO seria 4 (qtd 50); a entrada é a de qtd 10 a R$ 9.
    expect(r.get('p1')).toEqual({ quantidadeMinima: 10, precoUnitario: 9, faixasAdicionais: 2 })
  })

  it('não impõe preço decrescente: a entrada pode ter preço MAIOR que faixas seguintes', () => {
    const r = resumirFaixasAtacado(
      [
        f({ produto_id: 'p1', quantidade_minima: 5, preco_unitario: 8 }),
        f({ produto_id: 'p1', quantidade_minima: 6, preco_unitario: 9 }),
      ],
      null,
    )
    expect(r.get('p1')).toMatchObject({ quantidadeMinima: 5, precoUnitario: 8, faixasAdicionais: 1 })
  })

  it('faixa de outra loja e faixa inválida não contam; faixa da própria loja conta', () => {
    const r = resumirFaixasAtacado(
      [
        f({ produto_id: 'p1', quantidade_minima: 2, preco_unitario: 1, loja_id: 'loja-2' }),
        f({ produto_id: 'p1', quantidade_minima: 0, preco_unitario: 3 }),
        f({ produto_id: 'p1', quantidade_minima: 4, preco_unitario: -1 }),
        f({ produto_id: 'p1', quantidade_minima: null, preco_unitario: 3 }),
        f({ produto_id: 'p1', quantidade_minima: 8, preco_unitario: 6, loja_id: 'loja-1' }),
      ],
      'loja-1',
    )
    expect(r.get('p1')).toEqual({ quantidadeMinima: 8, precoUnitario: 6, faixasAdicionais: 0 })
  })

  it('aceita números vindos como string (numeric do PostgREST)', () => {
    const r = resumirFaixasAtacado(
      [f({ produto_id: 'p1', quantidade_minima: '12', preco_unitario: '7.50' })],
      null,
    )
    expect(r.get('p1')).toEqual({ quantidadeMinima: 12, precoUnitario: 7.5, faixasAdicionais: 0 })
  })

  it('mesma quantidade em faixa global e da loja conta como UMA faixa', () => {
    const r = resumirFaixasAtacado(
      [
        f({ produto_id: 'p1', quantidade_minima: 6, preco_unitario: 9, loja_id: null }),
        f({ produto_id: 'p1', quantidade_minima: 6, preco_unitario: 8, loja_id: 'loja-1' }),
      ],
      'loja-1',
    )
    expect(r.get('p1')).toMatchObject({ quantidadeMinima: 6, faixasAdicionais: 0 })
  })

  it('produto sem faixa aplicável não aparece; produtos são independentes', () => {
    const r = resumirFaixasAtacado(
      [
        f({ produto_id: 'p1', quantidade_minima: 3, preco_unitario: 2 }),
        f({ produto_id: 'p2', quantidade_minima: 9, preco_unitario: 5, loja_id: 'loja-9' }),
      ],
      'loja-1',
    )
    expect(r.has('p2')).toBe(false)
    expect(r.get('p1')).toMatchObject({ quantidadeMinima: 3 })
  })
})
