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

  it('mapeia estoque insuficiente da RPC canônica', () => {
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_ESTOQUE:SEM_SALDO')).toBe(
      'Estoque insuficiente para um ou mais itens. Ajuste o carrinho e tente novamente.',
    )
  })

  it('mapeia divergência de preço', () => {
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_PRECO_DIVERGENTE:abc')).toContain(
      'preços do carrinho mudaram',
    )
  })

  it('mapeia saldo pendente sem cliente', () => {
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_SALDO_PENDENTE_EXIGE_CLIENTE')).toContain(
      'cliente',
    )
  })
})
