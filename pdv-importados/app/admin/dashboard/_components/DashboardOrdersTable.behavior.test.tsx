/** @vitest-environment jsdom */
/**
 * G-06 — "Pedidos recentes" do Dashboard tinha um link/clique que parecia
 * levar ao pedido específico (id truncado, aria-label com o id completo) mas
 * sempre navegava para `/admin/vendas` genérico — mesmo bug já corrigido em
 * Relatórios na Sprint 3 (`adminVendaDetalheQuery`), aqui ainda pendente.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES, adminVendaDetalheQuery } from '@shared-core/navigation/routes'

const routerPushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

const { DashboardOrdersTable } = await import('./DashboardOrdersTable')
type DashboardOrderRow = import('./DashboardOrdersTable').DashboardOrderRow

const labels = {
  colId: 'ID',
  colOperador: 'Operador',
  colData: 'Data',
  colValor: 'Valor',
  colPagamento: 'Pagamento',
  colStatus: 'Status',
  statusDone: 'Concluída',
  statusCancelled: 'Cancelada',
  empty: 'Nenhum pedido',
  loadFailed: 'Falha ao carregar',
  openOrdersAria: 'Abrir venda',
}

const pedido: DashboardOrderRow = {
  id: '11112222-3333-4444-5555-666677778888',
  operador: 'João',
  valor: 'R$ 100,00',
  status: 'CONCLUIDA',
  data: '17/09',
  formaPagamento: 'PIX',
}

describe('DashboardOrdersTable (G-06)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    routerPushMock.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('o link do id aponta para a venda específica, não para a lista genérica', () => {
    act(() => {
      root.render(<DashboardOrdersTable orders={[pedido]} labels={labels} loadFailed={false} />)
    })

    const link = container.querySelector('a') as HTMLAnchorElement
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe(adminVendaDetalheQuery(pedido.id))
    expect(link.getAttribute('href')).not.toBe(ROUTES.admin.vendas)
  })

  it('clicar na linha navega para a venda específica, não para a lista genérica', () => {
    act(() => {
      root.render(<DashboardOrdersTable orders={[pedido]} labels={labels} loadFailed={false} />)
    })

    const linha = container.querySelector('tbody tr') as HTMLTableRowElement
    act(() => {
      linha.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(routerPushMock).toHaveBeenCalledWith(adminVendaDetalheQuery(pedido.id))
    expect(routerPushMock).not.toHaveBeenCalledWith(ROUTES.admin.vendas)
  })
})
