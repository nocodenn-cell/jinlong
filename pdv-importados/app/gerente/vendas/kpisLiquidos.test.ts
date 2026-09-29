import { describe, expect, it } from 'vitest'
import { liquidarKpis } from './kpisLiquidos'

describe('liquidarKpis', () => {
  it('venda registrada e cancelada no período não conta como concluída nem faturada', () => {
    expect(
      liquidarKpis({ faturado: 150, qtdConcluidas: 2, qtdCanceladas: 1, valorCanceladas: 50 }),
    ).toEqual({ faturado: 100, qtdConcluidas: 1, ticketMedio: 100, qtdCanceladas: 1, valorCanceladas: 50 })
  })
  it('sem cancelamentos mantém os valores brutos', () => {
    expect(
      liquidarKpis({ faturado: 90, qtdConcluidas: 3, qtdCanceladas: 0, valorCanceladas: 0 }).ticketMedio,
    ).toBe(30)
  })
  it('cancelamento de venda de outro período não gera valores negativos', () => {
    expect(
      liquidarKpis({ faturado: 0, qtdConcluidas: 0, qtdCanceladas: 1, valorCanceladas: 40 }),
    ).toEqual({ faturado: 0, qtdConcluidas: 0, ticketMedio: 0, qtdCanceladas: 1, valorCanceladas: 40 })
  })
})
