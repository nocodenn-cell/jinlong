/** Roadmap UX, Tarefa 7 — drill-down do Dashboard: o detalhe aberto vive na URL (`?detalhe=`). */
import { describe, expect, it } from 'vitest'
import { dashboardHref, normalizeDetalhe } from './dashboardDetalhe'

describe('dashboardDetalhe', () => {
  it('aceita só os detalhes conhecidos', () => {
    expect(normalizeDetalhe('vendas')).toBe('vendas')
    expect(normalizeDetalhe('pedidos')).toBe('pedidos')
    expect(normalizeDetalhe('estoque')).toBeNull()
    expect(normalizeDetalhe(undefined)).toBeNull()
  })

  it('abrir o detalhe preserva período e status', () => {
    expect(dashboardHref({ period: '7D', status: 'CONCLUIDA' }, 'vendas')).toBe(
      '/admin/dashboard?period=7D&status=CONCLUIDA&detalhe=vendas',
    )
  })

  it('fechar remove só o detalhe', () => {
    expect(dashboardHref({ period: '30D' }, null)).toBe('/admin/dashboard?period=30D')
    expect(dashboardHref({}, null)).toBe('/admin/dashboard')
  })
})
