import { describe, expect, it } from 'vitest'
import { classificarEstoque, contarSituacoesEstoque } from './classificarEstoque'

describe('classificarEstoque (UX-006)', () => {
  it('saldo 0 e mínimo 0 é ZERADO, nunca "abaixo do mínimo"', () => {
    expect(classificarEstoque(0, 0)).toBe('ZERADO')
    expect(classificarEstoque(0, 10)).toBe('ZERADO')
    expect(classificarEstoque(-2, 5)).toBe('ZERADO')
  })

  it('saldo 9 e mínimo 10 é ABAIXO_MINIMO', () => {
    expect(classificarEstoque(9, 10)).toBe('ABAIXO_MINIMO')
  })

  it('saldo igual ao mínimo (>0) é NO_MINIMO', () => {
    expect(classificarEstoque(10, 10)).toBe('NO_MINIMO')
  })

  it('acima do mínimo, ou sem mínimo cadastrado, é OK', () => {
    expect(classificarEstoque(11, 10)).toBe('OK')
    expect(classificarEstoque(5, 0)).toBe('OK')
    expect(classificarEstoque(5, null)).toBe('OK')
  })

  it('nulos e inválidos não quebram', () => {
    expect(classificarEstoque(null, null)).toBe('ZERADO')
    expect(classificarEstoque(Number.NaN, 3)).toBe('OK')
  })

  it('contagem separa as três situações a partir das linhas da view de alerta', () => {
    const linhas = [
      { quantidade_atual: 0, estoque_minimo: 0 },
      { quantidade_atual: 0, estoque_minimo: 5 },
      { quantidade_atual: 3, estoque_minimo: 5 },
      { quantidade_atual: 5, estoque_minimo: 5 },
      { quantidade_atual: 4, estoque_minimo: 5 },
    ]
    expect(contarSituacoesEstoque(linhas)).toEqual({ zerados: 2, abaixoMinimo: 2, noMinimo: 1 })
  })

  it('a soma das três situações = total do alerta (saldo <= mínimo), então bate com o contador do banco', () => {
    const linhas = [
      { quantidade_atual: 0, estoque_minimo: 0 },
      { quantidade_atual: 2, estoque_minimo: 2 },
      { quantidade_atual: 1, estoque_minimo: 2 },
    ]
    const c = contarSituacoesEstoque(linhas)
    expect(c.zerados + c.abaixoMinimo + c.noMinimo).toBe(linhas.length)
  })
})
