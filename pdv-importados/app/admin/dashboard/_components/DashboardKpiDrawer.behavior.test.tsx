/** @vitest-environment jsdom */
/**
 * Roadmap UX, Tarefa 7 — gaveta de drill-down do Dashboard. Aberta quando a URL tem
 * `?detalhe=`; fechar (ESC, X, backdrop) troca a URL pela versão sem o detalhe, sem rolar.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))

const { DashboardKpiDrawer } = await import('./DashboardKpiDrawer')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  replace.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

function render(open: boolean) {
  flushSync(() =>
    root.render(
      <DashboardKpiDrawer open={open} title="Vendas do período" closeHref="/admin/dashboard?period=7D">
        <p>por dia</p>
      </DashboardKpiDrawer>,
    ),
  )
}

const gaveta = () => document.querySelector('[role="dialog"][data-placement="drawer"]')

describe('DashboardKpiDrawer', () => {
  it('fechado (sem ?detalhe=) não renderiza nada', () => {
    render(false)
    expect(gaveta()).toBeNull()
  })

  it('aberto mostra a gaveta com o título e o conteúdo', () => {
    render(true)
    expect(gaveta()).not.toBeNull()
    expect(gaveta()!.textContent).toContain('Vendas do período')
    expect(gaveta()!.textContent).toContain('por dia')
  })

  it('ESC e X voltam para a URL sem o detalhe, sem rolar a página', () => {
    render(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(replace).toHaveBeenLastCalledWith('/admin/dashboard?period=7D', { scroll: false })
    ;(document.querySelector('button[aria-label="Fechar"]') as HTMLButtonElement).click()
    expect(replace).toHaveBeenCalledTimes(2)
  })
})
