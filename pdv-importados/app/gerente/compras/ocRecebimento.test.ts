import { describe, expect, it } from 'vitest'
import {
  mensagemErroOc,
  mensagemPosEntradaOc,
  ocAceitaRecebimento,
  ocPodeCancelar,
  ocPodeEncerrarComFalta,
  saldoPendente,
  situacaoRecebimento,
  textoPosEntrada,
  totaisRecebimento,
  valorPendente,
} from './ocRecebimento'

describe('saldo derivado (não existe status "parcial" armazenado)', () => {
  it('100 pedidas, 60 recebidas → pendente 40; 100/100 → 0; recebido a mais (legado) nunca fica negativo', () => {
    expect(saldoPendente(100, 60)).toBe(40)
    expect(saldoPendente(100, 100)).toBe(0)
    expect(saldoPendente(100, 130)).toBe(0)
  })

  it('não acumula erro de ponto flutuante (0,1 + 0,2)', () => {
    expect(saldoPendente(0.3, 0.1)).toBe(0.2)
    expect(saldoPendente(1, 0.9)).toBe(0.1)
  })

  it('totais somam por item e contam itens pendentes', () => {
    expect(
      totaisRecebimento([
        { quantidade: 100, quantidade_recebida: 60 },
        { quantidade: 10, quantidade_recebida: 10 },
      ]),
    ).toEqual({ pedido_total: 110, recebido_total: 70, pendente_total: 40, itens_pendentes: 1 })
  })

  it('situação: nada / parcial / completo / encerrado com falta', () => {
    expect(situacaoRecebimento({ status: 'EM_TRANSITO', encerrada_com_falta: false, recebido_total: 0, pendente_total: 100 })).toBe('NADA_RECEBIDO')
    expect(situacaoRecebimento({ status: 'EM_TRANSITO', encerrada_com_falta: false, recebido_total: 60, pendente_total: 40 })).toBe('PARCIAL')
    expect(situacaoRecebimento({ status: 'RECEBIDA', encerrada_com_falta: false, recebido_total: 100, pendente_total: 0 })).toBe('COMPLETO')
    expect(situacaoRecebimento({ status: 'RECEBIDA', encerrada_com_falta: true, recebido_total: 60, pendente_total: 40 })).toBe('ENCERRADO_COM_FALTA')
  })
})

describe('"Valor em trânsito" reflete só o que falta chegar', () => {
  it('pedido de 100 × R$ 3 com 60 recebidas → R$ 120 (não R$ 300)', () => {
    expect(valorPendente([{ quantidade: 100, quantidade_recebida: 60, preco_unitario: 3 }])).toBe(120)
  })

  it('pedido totalmente recebido não conta; soma linhas com preços diferentes', () => {
    expect(
      valorPendente([
        { quantidade: 10, quantidade_recebida: 10, preco_unitario: 50 },
        { quantidade: 4, quantidade_recebida: 1, preco_unitario: 2.5 },
      ]),
    ).toBe(7.5)
  })
})

describe('quais ações o pedido oferece', () => {
  it('receber: só em aberto e com saldo', () => {
    expect(ocAceitaRecebimento('EM_TRANSITO', 40)).toBe(true)
    expect(ocAceitaRecebimento('EM_TRANSITO', 0)).toBe(false)
    expect(ocAceitaRecebimento('RECEBIDA', 40)).toBe(false)
    expect(ocAceitaRecebimento('CANCELADA', 40)).toBe(false)
  })

  it('encerrar com falta: exige algo recebido E algo pendente', () => {
    expect(ocPodeEncerrarComFalta({ status: 'EM_TRANSITO', recebido_total: 60, pendente_total: 40 })).toBe(true)
    expect(ocPodeEncerrarComFalta({ status: 'EM_TRANSITO', recebido_total: 0, pendente_total: 100 })).toBe(false)
    expect(ocPodeEncerrarComFalta({ status: 'EM_TRANSITO', recebido_total: 100, pendente_total: 0 })).toBe(false)
    expect(ocPodeEncerrarComFalta({ status: 'RECEBIDA', recebido_total: 60, pendente_total: 40 })).toBe(false)
  })

  it('cancelar: só quando nada foi recebido', () => {
    expect(ocPodeCancelar({ status: 'EM_TRANSITO', recebido_total: 0 })).toBe(true)
    expect(ocPodeCancelar({ status: 'EM_TRANSITO', recebido_total: 60 })).toBe(false)
    expect(ocPodeCancelar({ status: 'RECEBIDA', recebido_total: 0 })).toBe(false)
  })
})

describe('mensagens operacionais', () => {
  it('erro de excesso traz quanto falta e garante que nada foi lançado', () => {
    const m = mensagemErroOc('OC_QTD_ACIMA_SALDO:abc:40.000')
    expect(m).toContain('Faltam 40 unidades.')
    expect(m).toContain('Nada foi lançado no estoque')
  })

  it('cada código do banco tem tradução; texto que não é de OC devolve null (cai no tradutor genérico)', () => {
    for (const c of [
      'OC_STATUS_INVALIDO',
      'OC_ENTRADA_VAZIA',
      'OC_QTD_INVALIDA',
      'OC_ITEM_DUPLICADO',
      'OC_ITEM_NAO_ENCONTRADO',
      'OC_IDEMPOTENCY_PAYLOAD_DIVERGENTE',
      'OC_IDEMPOTENCY_KEY',
      'OC_PRODUTO_FORA_DO_PEDIDO:p',
      'OC_MOTIVO_OBRIGATORIO',
      'OC_SEM_RECEBIMENTO',
      'OC_JA_COMPLETA',
      'OC_CANCELAR_COM_RECEBIMENTO: x',
      'OC_RECEBIDA_SOMENTE_VIA_RPC: x',
      'OC_RECEBIDO_SOMENTE_VIA_RPC: x',
      'OC_NAO_ENCONTRADA',
      'OC_LOJA',
      'OC_PERFIL',
      'OC_AUTH',
    ]) {
      expect(mensagemErroOc(c), c).toBeTruthy()
    }
    expect(mensagemErroOc('duplicate key value violates unique constraint')).toBeNull()
    expect(mensagemErroOc('')).toBeNull()
  })

  it('pós-entrada: parcial diz o que entrou e quanto falta; total diz que o pedido fechou', () => {
    expect(
      mensagemPosEntradaOc({ pedido_total: 100, recebido_total: 60, pendente_total: 40, encerrada: false, encerrada_com_falta: false }, 60),
    ).toBe('Estoque atualizado: +60. Pedido: 60 de 100 recebidas. Faltam 40 unidades.')
    expect(
      mensagemPosEntradaOc({ pedido_total: 100, recebido_total: 100, pendente_total: 0, encerrada: true, encerrada_com_falta: false }, 40),
    ).toBe('Estoque atualizado: +40. Pedido totalmente recebido.')
  })

  it('a versão i18n (templates) produz o mesmo texto', () => {
    const t = {
      estoque: 'Estoque atualizado: +{{n}}.',
      parcial: 'Pedido: {{recebido}} de {{pedido}} recebidas. Faltam {{n}} unidades.',
      completo: 'Pedido totalmente recebido.',
    }
    expect(textoPosEntrada(t, { pedido_total: 100, recebido_total: 60, pendente_total: 40, encerrada: false }, 60)).toBe(
      'Estoque atualizado: +60. Pedido: 60 de 100 recebidas. Faltam 40 unidades.',
    )
    expect(textoPosEntrada(t, { pedido_total: 100, recebido_total: 100, pendente_total: 0, encerrada: true }, 40)).toBe(
      'Estoque atualizado: +40. Pedido totalmente recebido.',
    )
  })
})
