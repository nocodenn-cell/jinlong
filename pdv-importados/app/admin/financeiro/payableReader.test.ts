import { describe, expect, it, vi } from 'vitest'
import { FINANCIAL_ERROR_CODES } from '@shared-core/src/financial'
import { createPayableReader } from './payableReader'

function thenableQuery(result: { data: unknown; error: { message: string } | null }) {
  const qb: Record<string, unknown> = {}
  const api = {
    select: () => api,
    order: () => api,
    range: () => api,
    eq: () => api,
    gte: () => api,
    lt: () => api,
    or: () => api,
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
  }
  Object.assign(qb, api)
  return api
}

describe('payableReader', () => {
  it('lista e mapeia PayableTitle', async () => {
    const row = {
      id: 'c1',
      fornecedor_id: 'f1',
      descricao: 'NF',
      valor_total: 100,
      valor_pago: 0,
      vencimento: '2026-07-01',
      status: 'pendente',
      nfe_numero: '123',
      nfe_importacao_id: null,
      criado_em: '2026-06-01',
      loja_id: 'l1',
      fornecedor: { nome: 'Fornecedor X' },
    }
    const supabase = {
      from: vi.fn(() => thenableQuery({ data: [row], error: null })),
    } as never
    const result = await createPayableReader(supabase).list({ page: 1, status: 'todos' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.contas[0]).toMatchObject({
      contaId: 'c1',
      fornecedorNome: 'Fornecedor X',
      nfeNumero: '123',
      status: 'PENDENTE',
      lojaId: 'l1',
    })
  })

  it('propaga erro de listagem', async () => {
    const supabase = {
      from: vi.fn(() => thenableQuery({ data: null, error: { message: 'boom' } })),
    } as never
    await expect(createPayableReader(supabase).list({ page: 1 })).resolves.toMatchObject({
      ok: false,
      code: FINANCIAL_ERROR_CODES.LIST_FAILED,
    })
  })
})
