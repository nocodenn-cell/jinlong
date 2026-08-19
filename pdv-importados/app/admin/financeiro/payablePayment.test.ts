import { describe, expect, it, vi } from 'vitest'
import { createPayablePaymentService } from './payablePayment'

describe('payablePayment', () => {
  it('envia correlação e devolve pagamento/sangria', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        pagamento_id: 'p1',
        idempotent_replay: false,
        caixa_id: 'cx1',
        movimentacao_caixa_id: 'm1',
      }],
      error: null,
    }))
    const service = createPayablePaymentService({ rpc } as never)
    await expect(service.pay({
      contaId: 'ap1',
      valor: 10,
      formaPagamento: 'DINHEIRO',
      data: '2026-08-13T12:00:00Z',
      idempotencyKey: 'key-1',
      caixaId: 'cx1',
      autorizacaoToken: 'token-1',
    })).resolves.toEqual({
      ok: true,
      pagamentoId: 'p1',
      idempotentReplay: false,
      caixaId: 'cx1',
      movimentacaoCaixaId: 'm1',
    })
    expect(rpc).toHaveBeenCalledWith('registrar_pagamento_contas_pagar', expect.objectContaining({
      p_conta_id: 'ap1',
      p_idempotency_key: 'key-1',
      p_caixa_id: 'cx1',
      p_autorizacao_token: 'token-1',
    }))
  })
})
