import { describe, expect, it } from 'vitest'
import { planejarRestauracaoFaixas, type FaixaSnapshot } from './importarProdutosFaixas'

const faixa = (id: string, q: number, p: number, ativo = true): FaixaSnapshot => ({
  id,
  quantidade_minima: q,
  preco_unitario: p,
  ativo,
})

describe('planejarRestauracaoFaixas', () => {
  it('nada mudou → nada a fazer', () => {
    const antes = [faixa('a', 5, 10), faixa('b', 20, 8, false)]
    expect(planejarRestauracaoFaixas(antes, antes)).toEqual({ restaurar: [], remover: [] })
  })

  it('faixa desativada pela importação é restaurada como ativa', () => {
    const antes = [faixa('a', 5, 10)]
    const agora = [faixa('a', 5, 10, false)]
    expect(planejarRestauracaoFaixas(antes, agora).restaurar).toEqual([faixa('a', 5, 10)])
  })

  it('preço ou mínimo alterado pela importação é restaurado', () => {
    const antes = [faixa('a', 5, 10), faixa('b', 20, 8)]
    const agora = [faixa('a', 5, 12), faixa('b', 25, 8)]
    expect(planejarRestauracaoFaixas(antes, agora).restaurar).toEqual(antes)
  })

  it('faixa criada pela importação é removida', () => {
    const antes = [faixa('a', 5, 10)]
    const agora = [faixa('a', 5, 10), faixa('nova', 30, 7)]
    expect(planejarRestauracaoFaixas(antes, agora)).toEqual({ restaurar: [], remover: ['nova'] })
  })

  it('faixa que já estava inativa antes continua inativa (não é reativada)', () => {
    const antes = [faixa('a', 5, 10, false)]
    expect(planejarRestauracaoFaixas(antes, antes).restaurar).toEqual([])
  })

  it('faixa que sumiu não é recriada (a importação nunca apaga faixas)', () => {
    expect(planejarRestauracaoFaixas([faixa('a', 5, 10)], [])).toEqual({ restaurar: [], remover: [] })
  })
})
