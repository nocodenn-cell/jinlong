import { describe, expect, it } from 'vitest'
import { adminVendaDetalheQuery, ROUTES } from '@shared-core/navigation/routes'

describe('adminVendaDetalheQuery (RM-03 — linha de Relatórios abre o detalhe da venda)', () => {
  it('monta a URL de vendas com o id da venda na query string', () => {
    expect(adminVendaDetalheQuery('venda-123')).toBe(`${ROUTES.admin.vendas}?venda=venda-123`)
  })

  it('não adiciona query string para um id vazio', () => {
    expect(adminVendaDetalheQuery('')).toBe(ROUTES.admin.vendas)
    expect(adminVendaDetalheQuery('   ')).toBe(ROUTES.admin.vendas)
  })
})
