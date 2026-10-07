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

const { EstoqueHubNav } = await import('@/components/ui/admin-v2/EstoqueHubNav')
const { CatalogoHubNav } = await import('@/components/ui/admin-v2/CatalogoHubNav')

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('HubNav — Etiquetas visível (pt/zh)', () => {
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

  it.each([
    { idioma: 'pt' as const, label: 'Imprimir Etiquetas' },
    { idioma: 'zh' as const, label: '打印标签' },
  ])('EstoqueHubNav expõe $label → rota canônica ($idioma)', ({ idioma, label }) => {
    act(() => {
      root.render(
        <AdminV2SessionProvider idioma={idioma}>
          <EstoqueHubNav />
        </AdminV2SessionProvider>,
      )
    })
    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === label)
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe(ROUTES.admin.estoqueImprimirEtiquetas)
  })

  it.each([
    { idioma: 'pt' as const, label: 'Imprimir Etiquetas' },
    { idioma: 'zh' as const, label: '打印标签' },
  ])('CatalogoHubNav expõe $label → mesma rota ($idioma)', ({ idioma, label }) => {
    act(() => {
      root.render(
        <AdminV2SessionProvider idioma={idioma}>
          <CatalogoHubNav />
        </AdminV2SessionProvider>,
      )
    })
    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === label)
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe(ROUTES.admin.estoqueImprimirEtiquetas)
  })
})
