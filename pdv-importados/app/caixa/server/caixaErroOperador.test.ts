import { describe, expect, it } from 'vitest'
import { caixaErroOperador } from '@/app/caixa/server/caixaErroOperador'

describe('caixaErroOperador', () => {
  it('não expõe rpcErr nem fetch_failed', () => {
    expect(caixaErroOperador('rpcErr: connection failed')).toBe(
      'Não foi possível concluir. Tente novamente.',
    )
    expect(caixaErroOperador('fetch_failed: CAIXA_NOT_FOUND')).toBe(
      'Não foi possível concluir. Tente novamente.',
    )
  })

  it('mapeia movimentações pendentes', () => {
    expect(caixaErroOperador('FECHAR_CAIXA_MOVIMENTACOES_PENDENTES')).toBe(
      'Há vendas pendentes para finalizar.',
    )
  })

  it('oculta mensagens de migration', () => {
    expect(
      caixaErroOperador('function calcular_valor does not exist — Aplique migrations 048'),
    ).toBe('Caixa indisponível no momento.')
  })

  it('mapeia caixa fechado no contexto de finalizar', () => {
    expect(caixaErroOperador('FINALIZAR: caixa fechado')).toBe(
      'Caixa fechado. Abra o caixa antes de finalizar a venda.',
    )
  })

  it('mapeia ausência de caixa aberto para fechamento', () => {
    expect(caixaErroOperador('Não há caixa aberto')).toBe(
      'Não há caixa aberto para fechar.',
    )
  })

  it('mapeia sessão/JWT sem vazar detalhe técnico', () => {
    expect(caixaErroOperador('JWT expired')).toBe('Sessão expirada. Faça login novamente.')
  })
})
