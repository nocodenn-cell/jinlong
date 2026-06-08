import { describe, expect, it } from 'vitest'
import { isCaixaAberto } from '@/app/caixa/hooks/useCaixaStatusMovimentacoes'

describe('isCaixaAberto', () => {
  it('ERRO não é tratado como fechado para venda', () => {
    expect(isCaixaAberto({ status: 'ERRO', error: 'falha' })).toBe(false)
    expect(isCaixaAberto({ status: 'FECHADO' })).toBe(false)
    expect(isCaixaAberto(null)).toBe(false)
  })

  it('ABERTO habilita fluxo operacional', () => {
    expect(
      isCaixaAberto({
        status: 'ABERTO',
        caixaId: 'c1',
        dataAbertura: new Date().toISOString(),
        valorInicial: 0,
        valorSistemaDinheiro: 0,
        blindClosureEnabled: false,
      }),
    ).toBe(true)
  })
})
