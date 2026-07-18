import { describe, expect, it } from 'vitest'
import {
  mensagemErroAjusteEstoqueManual,
  parseEstoqueInicialIntent,
  resolverFeedbackCadastroEstoque,
} from './estoqueInicialCadastro'

describe('parseEstoqueInicialIntent', () => {
  it('não aplica quando qty e min vazios/zero', () => {
    expect(parseEstoqueInicialIntent('', '')).toEqual({
      quantidade: 0,
      minimo: 0,
      deveAplicar: false,
    })
    expect(parseEstoqueInicialIntent('0', '0').deveAplicar).toBe(false)
  })

  it('aplica quando qty > 0', () => {
    expect(parseEstoqueInicialIntent('10', '')).toEqual({
      quantidade: 10,
      minimo: 0,
      deveAplicar: true,
    })
  })

  it('aplica quando só mínimo > 0', () => {
    expect(parseEstoqueInicialIntent('', '3')).toEqual({
      quantidade: 0,
      minimo: 3,
      deveAplicar: true,
    })
  })
})

describe('mensagemErroAjusteEstoqueManual', () => {
  it('mapeia códigos da RPC (incl. p_ator_id / auth)', () => {
    expect(mensagemErroAjusteEstoqueManual('AJUSTE_ESTOQUE_AUTH')).toContain('login')
    expect(
      mensagemErroAjusteEstoqueManual('Estoque: AJUSTE_ESTOQUE_PERFIL'),
    ).toContain('gerente')
    expect(mensagemErroAjusteEstoqueManual('AJUSTE_ESTOQUE_LOJA_INVALIDA')).toContain('loja')
    expect(mensagemErroAjusteEstoqueManual('AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA')).toContain(
      'estoque',
    )
  })

  it('preserva detalhe desconhecido', () => {
    expect(mensagemErroAjusteEstoqueManual('timeout rpc')).toBe('timeout rpc')
  })
})

describe('resolverFeedbackCadastroEstoque', () => {
  it('sucesso pleno quando estoque pedido e ok', () => {
    expect(
      resolverFeedbackCadastroEstoque({
        estoquePedido: true,
        estoqueOk: true,
        estoqueErro: null,
      }),
    ).toEqual({ kind: 'success_pleno' })
  })

  it('sucesso sem estoque pedido', () => {
    expect(
      resolverFeedbackCadastroEstoque({
        estoquePedido: false,
        estoqueOk: true,
        estoqueErro: null,
      }),
    ).toEqual({ kind: 'success_sem_estoque_pedido' })
  })

  it('nunca classifica sucesso pleno se estoque pedido falhou', () => {
    const r = resolverFeedbackCadastroEstoque({
      estoquePedido: true,
      estoqueOk: false,
      estoqueErro: 'AJUSTE_ESTOQUE_AUTH',
    })
    expect(r.kind).toBe('produto_ok_estoque_falhou')
    if (r.kind === 'produto_ok_estoque_falhou') {
      expect(r.errorDetail).toBe('AJUSTE_ESTOQUE_AUTH')
    }
  })
})
