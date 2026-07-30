import { describe, expect, it } from 'vitest'
import {
  avaliarMargem,
  formatMargemPercentual,
  margemToneClassName,
} from './produtoForm.margem'

describe('avaliarMargem', () => {
  it('fica indefinida sem custo informado', () => {
    expect(avaliarMargem(50, null)).toEqual({
      tom: 'indefinida',
      valor: null,
      percentual: null,
    })
  })

  it('fica indefinida sem preço de venda', () => {
    expect(avaliarMargem(null, 20).tom).toBe('indefinida')
  })

  it('fica indefinida com preço de venda zerado', () => {
    // Rascunho: venda vazia não deve acusar prejuízo.
    expect(avaliarMargem(0, 20).tom).toBe('indefinida')
  })

  it('acusa prejuízo quando a venda é menor que o custo', () => {
    const r = avaliarMargem(80, 100)
    expect(r.tom).toBe('negativa')
    expect(r.valor).toBe(-20)
    expect(r.percentual).toBeCloseTo(-25)
  })

  it('acusa margem zero quando venda e custo são iguais', () => {
    const r = avaliarMargem(100, 100)
    expect(r.tom).toBe('zero')
    expect(r.valor).toBe(0)
    expect(r.percentual).toBe(0)
  })

  it('aceita margem saudável', () => {
    const r = avaliarMargem(100, 40)
    expect(r.tom).toBe('ok')
    expect(r.valor).toBe(60)
    expect(r.percentual).toBeCloseTo(60)
  })

  it('trata custo zero como informado — margem cheia', () => {
    const r = avaliarMargem(30, 0)
    expect(r.tom).toBe('ok')
    expect(r.percentual).toBe(100)
  })

  it('ignora valores não finitos', () => {
    expect(avaliarMargem(Number.NaN, 10).tom).toBe('indefinida')
    expect(avaliarMargem(10, Number.POSITIVE_INFINITY).tom).toBe('indefinida')
  })
})

describe('formatMargemPercentual', () => {
  it('usa vírgula decimal para casar com o valor monetário pt-BR', () => {
    expect(formatMargemPercentual(60)).toBe('60,0')
    expect(formatMargemPercentual(-25.34)).toBe('-25,3')
  })
})

describe('margemToneClassName', () => {
  it('usa o token de perigo na margem negativa', () => {
    expect(margemToneClassName('negativa')).toContain('--color-danger-bg')
  })

  it('usa o token de aviso na margem zero', () => {
    expect(margemToneClassName('zero')).toContain('--color-warning-bg')
  })

  it('mantém o visual neutro quando está ok ou indefinida', () => {
    expect(margemToneClassName('ok')).toContain('bg-jl-surface-soft')
    expect(margemToneClassName('indefinida')).toContain('bg-jl-surface-soft')
  })
})
