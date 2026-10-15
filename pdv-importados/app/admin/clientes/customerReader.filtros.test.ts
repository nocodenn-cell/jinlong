import { describe, expect, it, vi } from 'vitest'
import { createCustomerReader } from './customerReader'

function cadeia(resultado: { data: unknown; error: unknown }) {
  const qb: Record<string, unknown> = {}
  const self = () => qb
  for (const metodo of ['select', 'order', 'range', 'eq', 'gt', 'in', 'or', 'not', 'lt', 'limit']) {
    qb[metodo] = vi.fn(self)
  }
  Object.assign(qb, {
    then(onFulfilled: (v: unknown) => unknown) {
      return Promise.resolve(resultado).then(onFulfilled)
    },
  })
  return qb
}

describe('customerReader filtros de lista', () => {
  it('saldo em aberto filtra saldo_crediario > 0 no servidor', async () => {
    const view = cadeia({ data: [], error: null })
    const supabase = { from: vi.fn(() => view) }
    const r = await createCustomerReader(supabase as never).listPaginados({
      page: 1,
      situacao: 'aberto',
      tipo: 'PF',
    })
    expect(r.ok).toBe(true)
    expect(view.gt).toHaveBeenCalledWith('saldo_crediario', 0)
    expect(view.eq).toHaveBeenCalledWith('tipo', 'PF')
    expect(supabase.from).toHaveBeenCalledWith('v_clientes_gerente')
  })

  it('atraso sem títulos vencidos devolve lista vazia', async () => {
    const titulos = cadeia({
      data: [{ cliente_id: 'c1', status: 'ABERTO', vencimento: null }],
      error: null,
    })
    const supabase = { from: vi.fn(() => titulos) }
    const r = await createCustomerReader(supabase as never).listPaginados({
      page: 1,
      situacao: 'atraso',
    })
    expect(r).toEqual({ ok: true, clientes: [], hasMore: false })
    expect(supabase.from).toHaveBeenCalledWith('contas_receber')
    expect(supabase.from).not.toHaveBeenCalledWith('v_clientes_gerente')
  })
})
