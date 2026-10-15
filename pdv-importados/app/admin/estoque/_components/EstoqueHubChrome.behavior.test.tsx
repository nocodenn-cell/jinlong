/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/estoque/recebimento',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/components/ui/admin-v2/AdminV2UtilityBar', () => ({ AdminV2UtilityBar: () => null }))

import { EstoqueHubChrome } from './EstoqueHubChrome'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('EstoqueHubChrome', () => {
  it('mantém título, descrição e abas nessa ordem', () => {
    act(() => {
      root.render(
        <AdminV2SessionProvider idioma="pt">
          <EstoqueHubChrome title="Estoque" subtitle="Consulte quantidades">
            <p data-testid="aba-conteudo">conteúdo da aba</p>
          </EstoqueHubChrome>
        </AdminV2SessionProvider>,
      )
    })
    const chrome = container.querySelector('[data-testid="estoque-hub-chrome"]')
    const titulo = chrome?.querySelector('h1')
    const nav = chrome?.querySelector('[data-hub-tab-nav]')
    const conteudo = chrome?.querySelector('[data-testid="aba-conteudo"]')
    expect(titulo?.textContent).toBe('Estoque')
    expect(chrome?.textContent).toContain('Consulte quantidades')
    expect(titulo && nav && conteudo).toBeTruthy()
    expect(titulo!.compareDocumentPosition(nav!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(nav!.compareDocumentPosition(conteudo!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(nav?.textContent).toContain('Entradas')
  })
})
