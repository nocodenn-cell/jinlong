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

  it('RM-07: mapeia vendaId quando o título nasceu de uma venda fiado', async () => {
    const titulo = {
      id: 't1',
      valor_total: 50,
      valor_aberto: 50,
      status: 'ABERTO',
      descricao: null,
      vencimento: null,
      cliente_id: 'cli1',
      clientes: { nome: 'Maria' },
      venda_id: 'venda-99',
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
    expect(result.titulos[0].vendaId).toBe('venda-99')
  })

  it('RM-07: título sem venda de origem mapeia vendaId nulo', async () => {
    const titulo = {
      id: 't2',
      valor_total: 10,
      valor_aberto: 10,
      status: 'ABERTO',
      descricao: null,
      vencimento: null,
      cliente_id: 'cli1',
      clientes: { nome: 'Maria' },
      venda_id: null,
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
    expect(result.titulos[0].vendaId).toBeNull()
  })

  it('listLiquidacoes mapeia linhas incluindo estornos', async () => {
    const linhas = [
      { id: 'l2', titulo_id: 't1', valor: 30, forma_pagamento: 'PIX', created_at: '2026-08-15T10:00:00Z', operacao_tipo: 'ESTORNO', operacao_origem_id: 'l1' },
      { id: 'l1', titulo_id: 't1', valor: 30, forma_pagamento: 'PIX', created_at: '2026-08-14T10:00:00Z', operacao_tipo: 'RECEBIMENTO', operacao_origem_id: null },
    ]
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'liquidacoes_receber') return thenableQuery({ data: linhas, error: null })
        return thenableQuery({ data: [], error: null })
      }),
    } as never
    const result = await createReceivableReader(supabase).listLiquidacoes({ tituloId: 't1' })
    expect(result).toEqual({
      ok: true,
      liquidacoes: [
        { id: 'l2', tituloId: 't1', valor: 30, formaPagamento: 'PIX', createdAt: '2026-08-15T10:00:00Z', operacaoTipo: 'ESTORNO', operacaoOrigemId: 'l1' },
        { id: 'l1', tituloId: 't1', valor: 30, formaPagamento: 'PIX', createdAt: '2026-08-14T10:00:00Z', operacaoTipo: 'RECEBIMENTO', operacaoOrigemId: null },
      ],
    })
  })
})
