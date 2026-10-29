import { describe, expect, it } from 'vitest'
import { notaSemObrigacao, valorEconomicoNota } from './notaObrigacao'

describe('valorEconomicoNota', () => {
  it('soma quantidade × custo de cada item', () => {
    expect(valorEconomicoNota([{ quantidade: 2, custo_unitario: 10 }, { quantidade: 3, custo_unitario: 1.5 }])).toBe(24.5)
  })
  it('arredonda para centavos como o banco (numeric(14,2))', () => {
    expect(valorEconomicoNota([{ quantidade: 0.001, custo_unitario: 0.4 }])).toBe(0)
    expect(valorEconomicoNota([{ quantidade: 0.01, custo_unitario: 0.5 }])).toBe(0.01)
  })
  it('zero quando não há itens ou os valores são zero', () => {
    expect(valorEconomicoNota([])).toBe(0)
    expect(valorEconomicoNota([{ quantidade: 0, custo_unitario: 10 }])).toBe(0)
  })
})

describe('notaSemObrigacao (SSOT-003)', () => {
  it('bloqueia valor positivo sem duplicatas', () => {
    expect(notaSemObrigacao(100, 0)).toBe(true)
  })
  it('não bloqueia quando há duplicatas', () => {
    expect(notaSemObrigacao(100, 2)).toBe(false)
  })
  it('não bloqueia valor zero, mesmo sem duplicatas', () => {
    expect(notaSemObrigacao(0, 0)).toBe(false)
  })
  it('não bloqueia quando a contagem ainda não chegou (dado ausente)', () => {
    expect(notaSemObrigacao(100, undefined as unknown as number)).toBe(false)
  })
})
