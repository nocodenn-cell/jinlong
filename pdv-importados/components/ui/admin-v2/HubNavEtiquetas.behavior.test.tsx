/** @vitest-environment jsdom */
/**
 * Garante que Etiquetas aparece na UI dos hubs (não só nas constantes de nav).
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'

vi.mock('next/navigation', () => ({
  usePathname: () => ROUTES.admin.estoque,
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    className?: string
  } & Record<string, unknown>) =>
    React.createElement('a', { href, className, ...rest }, children),
}))

const { OperationalHubNav } = await import('@/components/ui/admin-v2/OperationalHubNav')
const { EstoqueHubNav } = await import('@/components/ui/admin-v2/EstoqueHubNav')
const { CatalogoHubNav } = await import('@/components/ui/admin-v2/CatalogoHubNav')

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('HubNav — Etiquetas visível em Abastecer (pt/zh)', () => {
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

  function renderCom(idioma: 'pt' | 'zh', nav: React.ReactNode) {
    act(() => {
      root.render(<AdminV2SessionProvider idioma={idioma}>{nav}</AdminV2SessionProvider>)
    })
  }

  it.each([
    { idioma: 'pt' as const, label: 'Etiquetas' },
    { idioma: 'zh' as const, label: '标签' },
  ])('hub Abastecer expõe $label → rota canônica ($idioma)', ({ idioma, label }) => {
    renderCom(idioma, <OperationalHubNav hub="compras" />)
    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === label)
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe(ROUTES.admin.estoqueImprimirEtiquetas)
  })

  it.each([
    { nome: 'Estoque', nav: <EstoqueHubNav /> },
    { nome: 'Catálogo', nav: <CatalogoHubNav /> },
  ])('hub $nome não repete a aba de etiquetas', ({ nav }) => {
    renderCom('pt', nav)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain(ROUTES.admin.estoqueImprimirEtiquetas)
  })
})
