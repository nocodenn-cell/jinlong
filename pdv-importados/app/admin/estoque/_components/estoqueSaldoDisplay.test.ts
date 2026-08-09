import { describe, expect, it } from 'vitest'
import { estoqueSaldoTone } from './estoqueSaldoDisplay'

describe('estoqueSaldoTone', () => {
  it('trata null como empty', () => {
    expect(estoqueSaldoTone(null, 5)).toBe('empty')
  })

  it('zero sem mínimo configurado fica neutro', () => {
    expect(estoqueSaldoTone(0, 0)).toBe('neutral-zero')
    expect(estoqueSaldoTone(0, null)).toBe('neutral-zero')
  })

  it('zero com mínimo > 0 é danger', () => {
    expect(estoqueSaldoTone(0, 5)).toBe('danger-zero')
  })

  it('abaixo ou igual ao mínimo (positivo) é low', () => {
    expect(estoqueSaldoTone(3, 5)).toBe('low')
    expect(estoqueSaldoTone(5, 5)).toBe('low')
  })

  it('acima do mínimo é ok', () => {
    expect(estoqueSaldoTone(10, 5)).toBe('ok')
    expect(estoqueSaldoTone(2, 0)).toBe('ok')
  })
})
