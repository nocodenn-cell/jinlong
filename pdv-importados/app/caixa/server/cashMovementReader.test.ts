import { describe, expect, it, vi } from 'vitest'
import { CASH_ERROR_CODES } from '@shared-core/src/cash'
import { createCashMovementReader, listMovimentacoesCaixaDto } from './cashMovementReader'

function thenableQuery(result: { data: unknown; error: { message: string } | null }) {
  const api = {
    select: () => api,
    eq: () => api,
    is: () => api,
    order: () => api,
    limit: () => api,
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
  }
  return api
}

const row = {
  id: 'm1',
  numero_sequencial: 3,
  caixa_id: 'cx1',
  operador_id: 'op1',
  gerente_id: null,
  tipo: 'sangria',
  forma_pagamento: 'dinheiro',
  valor: 20,
  motivo_codigo: 'OUTRO',
  motivo: 'Troco',
  status: 'aprovado',
  movimentacao_origem_id: null,
  saldo_antes: 100,
  saldo_depois: 80,
  created_at: '2026-07-18T12:00:00Z',
}

describe('cashMovementReader', () => {
  it('listByCaixa mapeia domínio', async () => {
    const supabase = { from: vi.fn(() => thenableQuery({ data: [row], error: null })) } as never
    const result = await createCashMovementReader(supabase).listByCaixa('cx1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.movements[0]).toMatchObject({
      movimentacaoId: 'm1',
      caixaId: 'cx1',
      tipo: 'sangria',
      valor: 20,
      status: 'aprovado',
    })
  })

  it('rejeita caixa vazio', async () => {
    const supabase = { from: vi.fn() } as never
    await expect(createCashMovementReader(supabase).listByCaixa('')).resolves.toMatchObject({
      ok: false,
      code: CASH_ERROR_CODES.READ_FAILED,
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('listMovimentacoesCaixaDto preserva campos da timeline', async () => {
    const supabase = { from: vi.fn(() => thenableQuery({ data: [row], error: null })) } as never
    const result = await listMovimentacoesCaixaDto(supabase, 'cx1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.itens[0]).toMatchObject({
      id: 'm1',
      numeroSequencial: 3,
      saldoAntes: 100,
      saldoDepois: 80,
      motivo: 'Troco',
    })
  })
})
