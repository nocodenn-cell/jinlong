import { describe, expect, it } from 'vitest'
import { mensagemErroDevolverVenda } from './devolverVendaErro'

const GENERICA = 'Não foi possível registrar a devolução. Tente novamente.'

describe('mensagemErroDevolverVenda — PR-2D (caixa pagador e D-13)', () => {
  it.each([
    ['DEVOLVER_VENDA_SEM_CAIXA_ABERTO', 'Não há caixa aberto'],
    ['DEVOLVER_VENDA_CAIXA_OBRIGATORIO', 'mais de um caixa aberto'],
    ['DEVOLVER_VENDA_CAIXA_INVALIDO', 'não está aberto'],
    ['DEVOLVER_VENDA_RETRY_CAIXA_DIVERGENTE', 'outro caixa'],
    ['DEVOLVER_VENDA_TITULO_COM_LIQUIDACAO', 'Estorne as liquidações'],
    ['DEVOLVER_VENDA_EXCEDE_VALOR_PAGO', 'efetivamente pagou'],
  ])('%s vira mensagem de regra (não a genérica de falha transitória)', (codigo, trecho) => {
    const msg = mensagemErroDevolverVenda(codigo)
    expect(msg).not.toBe(GENERICA)
    expect(msg).toContain(trecho)
  })

  it('reconhece o código dentro da mensagem bruta do Postgres', () => {
    expect(mensagemErroDevolverVenda('error: DEVOLVER_VENDA_TITULO_COM_LIQUIDACAO\nCONTEXT: ...')).toContain(
      'Estorne as liquidações',
    )
  })

  it('códigos antigos continuam mapeados', () => {
    expect(mensagemErroDevolverVenda('DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE')).toContain('insuficiente')
    expect(mensagemErroDevolverVenda('DEVOLVER_VENDA_VALOR_EXCEDE_ABERTO')).toContain('saldo em aberto')
  })

  it('código desconhecido cai na mensagem genérica', () => {
    expect(mensagemErroDevolverVenda('ALGO_QUE_NAO_EXISTE')).toBe(GENERICA)
  })
})
