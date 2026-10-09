/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinanceiroHubLabels } from '@/lib/navigation/financeiroHubGroups'

let pathname = '/admin/financeiro'
let search = ''
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

const { FinanceiroHubNav } = await import('./AdminHubTabNav')

const L: FinanceiroHubLabels = {
  resumo: 'Resumo',
  resultado: 'Resultado de caixa',
  receber: 'A receber',
  pagar: 'A pagar',
  contasConciliacao: 'Contas e conciliação',
  contas: 'Contas e saldos',
  recebiveis: 'PIX e cartões',
  conciliacao: 'Conciliação',
  fiscal: 'Fiscal',
  comissoes: 'Comissões',
  categorias: 'Categorias',
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  pathname = '/admin/financeiro'
  search = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function render(tab: Parameters<typeof FinanceiroHubNav>[0]['activeTab']) {
  flushSync(() => {
    root.render(<FinanceiroHubNav activeTab={tab} labels={L} ariaLabel="Seções" subAriaLabel="Vistas" />)
  })
}
const principal = () => Array.from(container.querySelectorAll('nav[aria-label="Seções"] a'))
const secundaria = () => Array.from(container.querySelectorAll('nav[aria-label="Vistas"] a'))

describe('FinanceiroHubNav (PR 5)', () => {
  it('renderiza 7 controles e marca o grupo da aba atual', () => {
    search = 'tab=conciliacao'
    render('conciliacao')
    expect(principal()).toHaveLength(7)
    expect(principal().find((a) => a.getAttribute('aria-current'))?.textContent).toBe('Contas e conciliação')
  })

  it('mostra o seletor de vistas e marca a vista atual', () => {
    search = 'tab=recebiveis'
    render('recebiveis')
    expect(secundaria().map((a) => a.textContent)).toEqual(['Contas e saldos', 'PIX e cartões', 'Conciliação'])
    expect(secundaria().find((a) => a.getAttribute('aria-current'))?.textContent).toBe('PIX e cartões')
  })

  it('sem seletor em A receber', () => {
    render('receber')
    expect(container.querySelector('[data-hub-subnav]')).toBeNull()
  })

  it('em Comissões marca só Comissões', () => {
    pathname = '/admin/comissoes'
    render('receber')
    expect(principal().filter((a) => a.getAttribute('aria-current')).map((a) => a.textContent)).toEqual(['Comissões'])
  })
})
