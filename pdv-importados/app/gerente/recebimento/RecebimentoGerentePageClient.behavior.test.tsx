/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const routerRefreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

vi.mock('./actions', () => ({
  criarRemessaConferencia: vi.fn(),
}))

import { RecebimentoGerentePageClient } from '@/app/gerente/recebimento/RecebimentoGerentePageClient'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'

const PRODUTOS = [{ id: 'p1', nome: 'Produto Teste', codigo_barras: null }]

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(<AdminV2SessionProvider idioma="pt">{ui}</AdminV2SessionProvider>)
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe('RecebimentoGerentePageClient — falha de carga', () => {
  it('mostra o alerta de falha real (não "cadastre produtos") quando loadError está presente, mesmo sem produtos', () => {
    render(
      <RecebimentoGerentePageClient
        idioma="pt"
        produtos={[]}
        remessasRecentes={[]}
        loadError="Não foi possível carregar produtos/remessas para recebimento. Tente novamente."
      />,
    )
    const alerta = container.querySelector('[role="alert"]')
    expect(alerta).not.toBeNull()
    expect(alerta?.textContent).toContain('Não foi possível carregar')
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('sem loadError e sem produtos, mostra o aviso normal de "cadastre produtos"', () => {
    render(<RecebimentoGerentePageClient idioma="pt" produtos={[]} remessasRecentes={[]} />)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  it('sem loadError e com produtos, não mostra nenhum dos dois avisos', () => {
    render(<RecebimentoGerentePageClient idioma="pt" produtos={PRODUTOS} remessasRecentes={[]} />)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    const statusEls = Array.from(container.querySelectorAll('[role="status"]'))
    expect(statusEls.some((el) => el.textContent?.includes('cadastre'))).toBe(false)
  })
})
