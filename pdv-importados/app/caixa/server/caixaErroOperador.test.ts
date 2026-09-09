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
      'Há movimentações de caixa pendentes. Resolva as pendências antes de fechar.',
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

  // Regressão: caixaVendas.impl.ts (guarda de caixa fechado ao finalizar
  // venda, quando a query de "caixa aberto" não retorna linha, sem erro de
  // banco) roteia por este texto para reaproveitar a tradução já existente
  // em vez de manter um literal PT hardcoded fora do pipeline.
  it('mapeia caixa fechado ao finalizar venda (PT e 中文)', () => {
    expect(caixaErroOperador('caixa fechado ao finalizar venda')).toBe(
      'Caixa fechado. Abra o caixa antes de finalizar a venda.',
    )
    expect(caixaErroOperador('caixa fechado ao finalizar venda', 'zh')).toBe(
      '收银台已关闭。请先开启收银台再完成销售。',
    )
  })

  it('mapeia BR-01 limite de crédito (excedido, token obrigatório, inválido e já usado) para a mesma mensagem acionável', () => {
    const esperado = 'Venda excede o limite de crédito do cliente — autorização do gerente necessária.'
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_EXCEDIDO:100/50')).toBe(esperado)
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_OBRIGATORIO')).toBe(esperado)
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_INVALIDO')).toBe(esperado)
    expect(caixaErroOperador('FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_JA_USADO')).toBe(esperado)
  })
})
