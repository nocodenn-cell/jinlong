/** @vitest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import { CATALOGO_HUB_TABS } from '@/lib/navigation/catalogoHubNav'

vi.mock('next/navigation', () => ({
  usePathname: () => ROUTES.admin.catalogo,
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

const { AdminHubTabNav } = await import('@/components/ui/admin-v2/AdminHubTabNav')

describe('AdminHubTabNav — operacional S7', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    flushSync(() => root.unmount())
    container.remove()
  })

  it('marca aba ativa com aria-current=page', () => {
    flushSync(() => {
      root.render(<AdminHubTabNav tabs={CATALOGO_HUB_TABS} ariaLabel="Hub catálogo" />)
    })
    const active = container.querySelector('a[aria-current="page"]')
    expect(active?.getAttribute('href')).toBe(ROUTES.admin.catalogo)
  })

  it('expõe barra rolável e foco visível (DS)', () => {
    flushSync(() => {
      root.render(<AdminHubTabNav tabs={CATALOGO_HUB_TABS} ariaLabel="Hub catálogo" />)
    })
    expect(container.querySelector('[data-hub-tab-nav]')).not.toBeNull()
    const link = container.querySelector('a')
    expect(link?.className).toMatch(/focus-visible:ring/)
  })
})
