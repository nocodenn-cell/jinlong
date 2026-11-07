import { describe, expect, it, vi } from 'vitest'
import { conciliarComAsaas } from './conciliacao'
import { criarAsaasMock } from './asaas'

describe('conciliarComAsaas', () => {
  it('aplica o status de cada cobrança como evento idempotente', async () => {
    const asaas = criarAsaasMock()
    const s = await asaas.criarAssinatura({ customer: 'c', valor: 99, billingType: 'PIX', nextDueDate: '2026-11-01', descricao: '', externalReference: 'e' })
    const rpc = vi.fn(async (fn: string) => fn === 'cobranca_assinaturas_para_conciliar'
      ? { data: [{ asaas_subscription_id: s.id }], error: null } : { data: {}, error: null })
    const r = await conciliarComAsaas({ rpc }, asaas)
    expect(r).toEqual({ assinaturas: 1, pagamentos: 1, falhasAsaas: 0, falhasBanco: 0 })
    expect(rpc).toHaveBeenCalledWith('cobranca_conciliar_pagamento', { p_payment: expect.objectContaining({ subscription: s.id, status: 'PENDING' }) })
  })
  it('falha transitória do Asaas: não chama nada no banco para aquela assinatura', async () => {
    const asaas = { ...criarAsaasMock(), cobrancasDaAssinatura: vi.fn().mockRejectedValue(new Error('503')) }
    const rpc = vi.fn(async (fn: string) => fn === 'cobranca_assinaturas_para_conciliar'
      ? { data: [{ asaas_subscription_id: 'sub_x' }], error: null } : { data: {}, error: null })
    const r = await conciliarComAsaas({ rpc }, asaas)
    expect(r.falhasAsaas).toBe(1)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
