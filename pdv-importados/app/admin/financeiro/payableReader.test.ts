import { describe, expect, it, vi } from 'vitest'
import { FINANCIAL_ERROR_CODES } from '@shared-core/src/financial'
import { createPayableReader } from './payableReader'

function thenableQuery(
  result: { data: unknown; error: { message: string } | null },
  spy?: { in?: unknown[]; lt?: unknown[] },
) {
  const qb: Record<string, unknown> = {}
  const api = {
    select: () => api,
    order: () => api,
    range: () => api,
    eq: () => api,
    gte: () => api,
    lt: (...args: unknown[]) => {
      spy?.lt?.push(args)
      return api
    },
    in: (...args: unknown[]) => {
      spy?.in?.push(args)
      return api
    },
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
      // Desde 20260911120000: `nfe_numero` é o número da NOTA e
      // `parcela_numero` o da duplicata — sem derivação no leitor.
      nfe_numero: '123',
      parcela_numero: '1',
      nfe_importacao_id: 'imp-1',
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
      nfeParcela: '1',
      status: 'PENDENTE',
      lojaId: 'l1',
    })
  })

  it('título sem parcela declarada não inventa número de parcela', async () => {
    const row = {
      id: 'c3',
      fornecedor_id: 'f1',
      descricao: 'Título avulso',
      valor_total: 10,
      valor_pago: 0,
      vencimento: '2026-07-01',
      status: 'pendente',
      nfe_numero: '7',
      parcela_numero: null,
      nfe_importacao_id: null,
      criado_em: '2026-06-01',
      loja_id: 'l1',
      fornecedor: null,
    }
    const supabase = {
      from: vi.fn(() => thenableQuery({ data: [row], error: null })),
    } as never
    const result = await createPayableReader(supabase).list({ page: 1, status: 'todos' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.contas[0].nfeNumero).toBe('7')
    expect(result.contas[0].nfeParcela).toBeNull()
  })

  it('computa atrasado por vencimento < hoje, não por igualdade de status (item 13)', async () => {
    const row = {
      id: 'c2',
      fornecedor_id: 'f1',
      descricao: 'NF vencida',
      valor_total: 50,
      valor_pago: 0,
      vencimento: '2000-01-01',
      status: 'pendente',
      nfe_numero: null,
      nfe_importacao_id: null,
      criado_em: '2026-06-01',
      loja_id: 'l1',
      fornecedor: null,
    }
    const supabase = {
      from: vi.fn(() => thenableQuery({ data: [row], error: null })),
    } as never
    const result = await createPayableReader(supabase).list({ page: 1, status: 'todos' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.contas[0].atrasado).toBe(true)
  })

  it("filtro status='atrasado' consulta por status em aberto + vencimento < hoje (não por status='ATRASADO')", async () => {
    const spy: { in: unknown[]; lt: unknown[] } = { in: [], lt: [] }
    const supabase = {
      from: vi.fn(() => thenableQuery({ data: [], error: null }, spy)),
    } as never
    await createPayableReader(supabase).list({ page: 1, status: 'atrasado' })
    expect(spy.in[0]?.[0]).toBe('status')
    expect(spy.in[0]?.[1]).toEqual(expect.arrayContaining(['PENDENTE', 'PARCIAL']))
    expect(spy.lt[0]?.[0]).toBe('vencimento')
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
