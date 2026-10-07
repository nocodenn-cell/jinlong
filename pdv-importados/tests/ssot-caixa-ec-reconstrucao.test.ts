/**
 * Invariante SSOT-001/002: saldo esperado E(C) reconstrói dos eventos canônicos.
 * Espelha a fórmula de internal.valor_sistema_dinheiro (termos 1–7 simplificados).
 */
import { describe, expect, it } from 'vitest'

type Events = {
  valorInicial: number
  vendasDinheiro: number
  arDinheiro: number
  suprimentos: number
  sangrias: number
  devolucoesDinheiro: number
}

function eDeC(e: Events): number {
  return Number(
    (
      e.valorInicial +
      e.vendasDinheiro +
      e.arDinheiro +
      e.suprimentos -
      e.sangrias -
      e.devolucoesDinheiro
    ).toFixed(2),
  )
}

describe('E(C) reconstrução canônica', () => {
  it('abertura + venda + sangria = esperado do painel', () => {
    const e = eDeC({
      valorInicial: 50,
      vendasDinheiro: 100,
      arDinheiro: 0,
      suprimentos: 0,
      sangrias: 30,
      devolucoesDinheiro: 0,
    })
    expect(e).toBe(120)
  })

  it('cancelamento remove venda do esperado (idempotente em relação a E)', () => {
    const antes = eDeC({
      valorInicial: 0,
      vendasDinheiro: 100,
      arDinheiro: 0,
      suprimentos: 0,
      sangrias: 0,
      devolucoesDinheiro: 0,
    })
    const depoisCancel = eDeC({
      valorInicial: 0,
      vendasDinheiro: 0, // venda deixa de ser CONCLUIDA
      arDinheiro: 0,
      suprimentos: 0,
      sangrias: 0,
      devolucoesDinheiro: 0,
    })
    expect(antes).toBe(100)
    expect(depoisCancel).toBe(0)
  })

  it('devolução subtrai do caixa desembolsador', () => {
    expect(
      eDeC({
        valorInicial: 50,
        vendasDinheiro: 100,
        arDinheiro: 0,
        suprimentos: 0,
        sangrias: 0,
        devolucoesDinheiro: 40,
      }),
    ).toBe(110)
  })

  it('recebimento AR em dinheiro entra em E(C)', () => {
    expect(
      eDeC({
        valorInicial: 0,
        vendasDinheiro: 0,
        arDinheiro: 75,
        suprimentos: 10,
        sangrias: 5,
        devolucoesDinheiro: 0,
      }),
    ).toBe(80)
  })
})
