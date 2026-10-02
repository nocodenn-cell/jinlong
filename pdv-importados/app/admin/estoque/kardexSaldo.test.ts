import { describe, expect, it } from 'vitest'
import { calcularSaldoApos } from './kardexSaldo'

describe('calcularSaldoApos (UX-007)', () => {
  it('exemplo simples: +10, -3, -2 (antigo→novo) fecha em 5', () => {
    // exibidos novo→antigo: -2, -3, +10 ; saldo atual 5
    expect(calcularSaldoApos([-2, -3, 10], 5, 5)).toEqual([5, 7, 10])
  })

  it('histórico que não fecha com o saldo atual não inventa número', () => {
    expect(calcularSaldoApos([-2, -3, 10], 9, 5)).toEqual([null, null, null])
  })

  it('sem linha de estoque ou sem soma total provada, devolve null', () => {
    expect(calcularSaldoApos([1], null, 1)).toEqual([null])
    expect(calcularSaldoApos([1], 1, null)).toEqual([null])
  })

  it('aceita janela parcial (limite de exibição) quando o total fecha', () => {
    // total real: +10, -3, -2 = 5; só os 2 mais novos aparecem
    expect(calcularSaldoApos([-2, -3], 5, 5)).toEqual([5, 7])
  })
})
