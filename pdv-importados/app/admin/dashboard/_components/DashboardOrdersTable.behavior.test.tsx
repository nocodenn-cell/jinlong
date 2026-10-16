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
import { ROUTES, adminVendaDetalheQuery } from '@/lib/navigation/routes'

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

describe('DashboardOrdersTable — empty-state com CTA (Tarefa 6)', () => {
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

  it('sem pedidos, mostra o CTA e ele abre Vendas com o histórico completo', () => {
    act(() =>
      root.render(
        <DashboardOrdersTable
          orders={[]}
          labels={{ ...labels, emptyActionLabel: 'Abrir Vendas' }}
          loadFailed={false}
        />,
      ),
    )
    expect(container.textContent).toContain('Nenhum pedido')
    const cta = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Abrir Vendas')
    expect(cta).toBeDefined()
    act(() => cta!.click())
    // O texto promete o histórico completo; Vendas sem `periodo` abre só "hoje".
    expect(routerPushMock).toHaveBeenCalledWith(`${ROUTES.admin.vendas}?periodo=tudo`)
  })

  it('sem rótulo de CTA, o empty-state continua só informativo (compat)', () => {
    act(() => root.render(<DashboardOrdersTable orders={[]} labels={labels} loadFailed={false} />))
    expect(container.textContent).toContain('Nenhum pedido')
    expect(container.querySelector('button')).toBeNull()
  })

  it('com pedidos, não há empty-state nem CTA', () => {
    act(() =>
      root.render(
        <DashboardOrdersTable
          orders={[pedido]}
          labels={{ ...labels, emptyActionLabel: 'Abrir Vendas' }}
          loadFailed={false}
        />,
      ),
    )
    expect(container.textContent).not.toContain('Nenhum pedido')
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Abrir Vendas')).toBe(false)
  })
})
