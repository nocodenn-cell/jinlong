/**
 * UX-010 — a lista e os KPIs de Vendas vêm de RPCs que agora leem `vendas` (1 linha por venda). O app NÃO
 * pode mais abater cancelamentos do KPI (isso era a compensação do KPI por evento do ledger e, com a RPC
 * nova, subtrairia em dobro). Prova: o mapeamento é direto, e a lista mapeia status pelo tipo devolvido.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const assertGerenteSessionMock = vi.fn()

vi.mock('@/app/caixa/actions', () => ({ cancelarVenda: vi.fn() }))
vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession: assertGerenteSessionMock }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: rpcMock }) }))
vi.mock('@/lib/auth/staleSession', () => ({ clearStaleSessionIfNeeded: vi.fn() }))
vi.mock('@/app/gerente/vendas/devolverOuTrocarVenda.impl', () => ({ devolverOuTrocarVendaImpl: vi.fn() }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId: async () => 'loja-1' }))

const FILTRO = { inicio: null, fim: null, status: [] as string[], formaPagamento: [] as string[] }

beforeEach(() => {
  rpcMock.mockReset()
  assertGerenteSessionMock.mockReset()
  assertGerenteSessionMock.mockResolvedValue({ ok: true, session: { idioma: 'pt' } })
})

describe('obterKpisVendas (UX-010)', () => {
  it('usa os números da RPC como vêm, sem abater cancelamentos de novo', async () => {
    // 4 concluídas (R$ 400) e 2 canceladas (R$ 100): a RPC nova já exclui as canceladas das concluídas.
    rpcMock.mockResolvedValue({
      data: [{ faturado: 400, qtd_concluidas: 4, ticket_medio: 100, qtd_canceladas: 2, valor_canceladas: 100 }],
      error: null,
    })
    const { obterKpisVendas } = await import('./actions')
    expect(await obterKpisVendas(FILTRO)).toEqual({
      faturado: 400,
      qtdConcluidas: 4,
      ticketMedio: 100,
      qtdCanceladas: 2,
      valorCanceladas: 100,
    })
    expect(rpcMock).toHaveBeenCalledWith('kpis_venda_eventos_gerente', expect.objectContaining({ p_loja_id: 'loja-1' }))
  })

  it('RPC sem linha ou com erro devolve zeros', async () => {
    const { obterKpisVendas } = await import('./actions')
    rpcMock.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect((await obterKpisVendas(FILTRO)).qtdConcluidas).toBe(0)
    rpcMock.mockResolvedValue({ data: [], error: null })
    expect((await obterKpisVendas(FILTRO)).faturado).toBe(0)
  })
})

describe('buscarVendasPaginadasAction (UX-010)', () => {
  const linha = (id: string, tipo: 'SALE_REGISTERED' | 'SALE_CANCELLED') => ({
    event_id: id,
    sale_id: id,
    event_type: tipo,
    occurred_at: '2026-09-30T03:24:27Z',
    total: 10,
    total_bruto: 10,
    forma_pagamento: 'DINHEIRO',
    caixa_id: 'c1',
    operador_id: 'o1',
    items: [],
    qtd_itens_total: 1,
    qtd_itens_distintos: 1,
    primeiro_produto: 'Caneca',
  })

  it('venda normal e venda cancelada aparecem UMA vez cada, com o status certo; duas vendas = duas linhas', async () => {
    rpcMock.mockResolvedValue({ data: [linha('v-normal', 'SALE_REGISTERED'), linha('v-cancelada', 'SALE_CANCELLED')], error: null })
    const { buscarVendasPaginadasAction } = await import('./actions')
    const res = await buscarVendasPaginadasAction(1, FILTRO)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.vendas.map((v) => [v.id, v.status])).toEqual([
      ['v-normal', 'CONCLUIDA'],
      ['v-cancelada', 'CANCELADA'],
    ])
    const ids = res.vendas.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('o filtro de status vira p_event_types e chega à RPC (filtros preservados)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })
    const { buscarVendasPaginadasAction } = await import('./actions')
    await buscarVendasPaginadasAction(1, { ...FILTRO, status: ['CANCELADA'] })
    expect(rpcMock).toHaveBeenCalledWith(
      'listar_venda_eventos_gerente',
      expect.objectContaining({ p_event_types: ['SALE_CANCELLED'] }),
    )
    await buscarVendasPaginadasAction(1, { ...FILTRO, status: ['CONCLUIDA'], formaPagamento: ['PIX'] })
    expect(rpcMock).toHaveBeenLastCalledWith(
      'listar_venda_eventos_gerente',
      expect.objectContaining({ p_event_types: ['SALE_REGISTERED'], p_formas_pagamento: ['PIX'] }),
    )
  })
})
