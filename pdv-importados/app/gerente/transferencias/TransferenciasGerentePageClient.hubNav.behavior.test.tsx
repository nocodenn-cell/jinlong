/** @vitest-environment jsdom */
/**
 * Padrão de página do admin: título → abas do hub → conteúdo. As abas de
 * Estoque chegam via `hubNav` e devem aparecer logo abaixo do título.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./actions', () => ({
  executarTransferencia: vi.fn(),
  obterEstoqueDisponivelTransferencia: vi.fn(async () => ({
    success: true,
    quantidadeDisponivel: 0,
    unidadeMedida: 'UN',
    limiteObservacao: 50,
  })),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/estoque/transferencias',
  useSearchParams: () => new URLSearchParams(),
}))

const { TransferenciasGerentePageClient } = await import('./TransferenciasGerentePageClient')
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

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

describe('TransferenciasGerentePageClient — abas do hub', () => {
  it('renderiza as abas (hubNav) logo abaixo do título, nunca acima', async () => {
    await act(async () => {
      root.render(
        <AdminV2SessionProvider idioma="pt">
          <TransferenciasGerentePageClient
            idioma="pt"
            lojas={[]}
            produtos={[]}
            embeddedInAdminHub
            hubNav={<nav data-testid="hub-nav">abas</nav>}
          />
        </AdminV2SessionProvider>,
      )
    })

    const titulo = container.querySelector('h1')!
    const nav = container.querySelector('[data-testid="hub-nav"]')!
    expect(titulo).toBeTruthy()
    expect(nav).toBeTruthy()
    expect(titulo.closest('header')!.nextElementSibling).toBe(nav)
  })
})
