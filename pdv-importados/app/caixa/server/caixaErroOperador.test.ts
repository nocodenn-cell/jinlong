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

  it('mapeia MOV_CAIXA_SALDO_INSUFICIENTE sem expor o código RPC', () => {
    expect(caixaErroOperador('MOV_CAIXA_SALDO_INSUFICIENTE')).toContain('Saldo insuficiente')
    expect(caixaErroOperador('MOV_CAIXA_SALDO_INSUFICIENTE')).not.toContain('MOV_CAIXA')
  })
})
