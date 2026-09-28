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
      clienteId: '',
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
      clienteId: '',
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
      clienteId: '',
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

  describe('G-07 — filtro por cliente_id exato (sem ambiguidade de nome)', () => {
    const UUID_MARIA_A = '11111111-1111-1111-1111-111111111111'
    const UUID_MARIA_B = '22222222-2222-2222-2222-222222222222'

    function supabaseComTitulosDeAmbasMarias() {
      const titulosPorCliente: Record<string, unknown[]> = {
        [UUID_MARIA_A]: [
          {
            id: 't-a1',
            valor_total: 100,
            valor_aberto: 100,
            status: 'ABERTO',
            descricao: null,
            vencimento: null,
            cliente_id: UUID_MARIA_A,
            clientes: { nome: 'Maria Silva' },
          },
        ],
        [UUID_MARIA_B]: [
          {
            id: 't-b1',
            valor_total: 200,
            valor_aberto: 200,
            status: 'ABERTO',
            descricao: null,
            vencimento: null,
            cliente_id: UUID_MARIA_B,
            clientes: { nome: 'Maria Silva' },
          },
        ],
      }
      return {
        from: vi.fn((table: string) => {
          if (table !== 'contas_receber') return thenableQuery({ data: [], error: null })
          let filtroClienteId: string | null = null
          const api = {
            select: () => api,
            ilike: () => api,
            in: () => api,
            eq: (col: string, val: string) => {
              if (col === 'cliente_id') filtroClienteId = val
              return api
            },
            not: () => api,
            gte: () => api,
            lte: () => api,
            order: () => api,
            limit: () => api,
            then: (onFulfilled: (v: unknown) => unknown) =>
              Promise.resolve({
                data: filtroClienteId ? (titulosPorCliente[filtroClienteId] ?? []) : [],
                error: null,
              }).then(onFulfilled),
          }
          return api
        }),
      } as never
    }

    it('1. cliente_id correto retorna só os títulos daquele cliente', async () => {
      const result = await createReceivableReader(supabaseComTitulosDeAmbasMarias()).list({
        opcao: 'mix',
        clienteId: UUID_MARIA_A,
        nomeCliente: 'Maria Silva',
        q: '',
        de: '',
        ate: '',
        limite: 50,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.titulos).toHaveLength(1)
      expect(result.titulos[0].tituloId).toBe('t-a1')
      expect(result.titulos[0].clienteId).toBe(UUID_MARIA_A)
    })

    it('2. dois clientes com o mesmo nome — cliente_id nunca mistura os títulos', async () => {
      const supabase = supabaseComTitulosDeAmbasMarias()
      const resultA = await createReceivableReader(supabase).list({
        opcao: 'mix',
        clienteId: UUID_MARIA_A,
        nomeCliente: 'Maria Silva',
        q: '',
        de: '',
        ate: '',
        limite: 50,
      })
      const resultB = await createReceivableReader(supabase).list({
        opcao: 'mix',
        clienteId: UUID_MARIA_B,
        nomeCliente: 'Maria Silva',
        q: '',
        de: '',
        ate: '',
        limite: 50,
      })
      if (!resultA.ok || !resultB.ok) throw new Error('esperado ok:true nos dois')
      expect(resultA.titulos.map((t) => t.tituloId)).toEqual(['t-a1'])
      expect(resultB.titulos.map((t) => t.tituloId)).toEqual(['t-b1'])
    })

    it('3. cliente_id inválido/malformado retorna vazio, sem erro', async () => {
      const result = await createReceivableReader(supabaseComTitulosDeAmbasMarias()).list({
        opcao: 'mix',
        clienteId: 'nao-e-um-uuid',
        nomeCliente: '',
        q: '',
        de: '',
        ate: '',
        limite: 50,
      })
      expect(result).toEqual({ ok: true, titulos: [], capped: false })
    })

    it('4. ausência do filtro de cliente lista normalmente (comportamento default)', async () => {
      const titulo = {
        id: 't1',
        valor_total: 50,
        valor_aberto: 50,
        status: 'ABERTO',
        descricao: null,
        vencimento: null,
        cliente_id: 'cli1',
        clientes: { nome: 'Qualquer' },
      }
      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'contas_receber') return thenableQuery({ data: [titulo], error: null })
          return thenableQuery({ data: [], error: null })
        }),
      } as never
      const result = await createReceivableReader(supabase).list({
        opcao: 'mix',
        clienteId: '',
        nomeCliente: '',
        q: '',
        de: '',
        ate: '',
        limite: 50,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.titulos).toHaveLength(1)
    })
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
