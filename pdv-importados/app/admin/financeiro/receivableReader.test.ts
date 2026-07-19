import { describe, expect, it, vi } from 'vitest'
import { createReceivableReader } from './receivableReader'

function thenableQuery(result: { data: unknown; error: { message: string } | null }) {
  const api = {
    select: () => api,
    ilike: () => api,
    in: () => api,
    eq: () => api,
    not: () => api,
    gte: () => api,
    lte: () => api,
    order: () => api,
    limit: () => api,
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
  }
  return api
}

describe('receivableReader', () => {
  it('retorna vazio quando filtro de cliente não acha IDs', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'clientes') {
          return thenableQuery({ data: [], error: null })
        }
        return thenableQuery({ data: [], error: null })
      }),
    } as never
    const result = await createReceivableReader(supabase).list({
      opcao: 'mix',
      nomeCliente: 'Inexistente',
      q: '',
      de: '',
      ate: '',
      limite: 50,
    })
    expect(result).toEqual({ ok: true, titulos: [], capped: false })
  })

  it('mapeia título com clienteNome', async () => {
    const titulo = {
      id: 't1',
      valor_total: 50,
      valor_aberto: 50,
      status: 'ABERTO',
      descricao: 'Crediário',
      vencimento: '2026-08-01',
      cliente_id: 'cli1',
      clientes: { nome: 'Maria' },
    }
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'contas_receber') {
          return thenableQuery({ data: [titulo], error: null })
        }
        return thenableQuery({ data: [], error: null })
      }),
    } as never
    const result = await createReceivableReader(supabase).list({
      opcao: 'mix',
      nomeCliente: '',
      q: '',
      de: '',
      ate: '',
      limite: 50,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.titulos[0]).toMatchObject({
      tituloId: 't1',
      clienteId: 'cli1',
      clienteNome: 'Maria',
      valorTotal: 50,
    })
  })
})
