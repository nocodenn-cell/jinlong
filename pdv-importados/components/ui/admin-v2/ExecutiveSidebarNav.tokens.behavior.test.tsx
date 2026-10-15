/** @vitest-environment jsdom */
/**
 * Tokenização da sidebar executiva (roadmap UX, Tarefa 1).
 *
 * As cores vêm só dos tokens do DS: o estado ativo é pintado por
 * `.admin-v2-nav-link[data-active='true']` (tokens `--admin-v2-active-*`) e o CTA
 * "Abrir PDV" pelas utilidades `primary` (`--color-brand` / `--color-fg-on-brand`).
 * Nenhuma cor literal pode voltar a sobrescrever o tema.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let currentPathname = '/admin/dashboard'

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

const { ExecutiveSidebarNav } = await import('@/components/ui/admin-v2/ExecutiveSidebarNav')
const { getMessages } = await import('@/i18n/getMessages')
const { ROUTES } = await import('@/lib/navigation/routes')

/** Cor literal em classe: hex, rgb()/rgba() ou paleta crua do Tailwind (amber-400 etc.). */
const COR_LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(|\b(?:amber|yellow|stone|orange)-\d{2,3}\b/i

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  currentPathname = '/admin/dashboard'
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function renderNav() {
  flushSync(() => {
    root.render(
      React.createElement(ExecutiveSidebarNav, {
        admin: getMessages('pt').admin,
        chineseLanguage: false,
        showAdminOnlyItems: true,
      }),
    )
  })
  return container.querySelector('[data-testid="executive-sidebar-nav"]') as HTMLElement
}

function link(href: string): HTMLAnchorElement {
  const a = container.querySelector(`a[href="${href}"]`)
  if (!a) throw new Error(`link ausente: ${href}`)
  return a as HTMLAnchorElement
}

describe('ExecutiveSidebarNav — cores só por token', () => {
  it('nenhum elemento da sidebar carrega cor literal nas classes', () => {
    const nav = renderNav()
    const comCorLiteral = Array.from(nav.querySelectorAll<HTMLElement>('[class]'))
      .map((el) => el.getAttribute('class') ?? '')
      .filter((cls) => COR_LITERAL.test(cls))
    expect(comCorLiteral).toEqual([])
  })

  it('o destino ativo é marcado por data-active/aria-current, sem pintura própria', () => {
    renderNav()
    const ativo = link(ROUTES.admin.dashboard)
    expect(ativo.getAttribute('data-active')).toBe('true')
    expect(ativo.getAttribute('aria-current')).toBe('page')
    // Quem pinta é a classe do DS; o componente não pode sobrescrever com data-[active=true]:*.
    expect(ativo.className).toContain('admin-v2-nav-link')
    expect(ativo.className).not.toMatch(/data-\[active=true\]/)

    const inativo = link(ROUTES.admin.vendas)
    expect(inativo.getAttribute('data-active')).toBe('false')
    expect(inativo.hasAttribute('aria-current')).toBe(false)
  })

  it('o ativo acompanha a rota', () => {
    currentPathname = ROUTES.admin.vendas
    renderNav()
    expect(link(ROUTES.admin.vendas).getAttribute('aria-current')).toBe('page')
    expect(link(ROUTES.admin.dashboard).hasAttribute('aria-current')).toBe(false)
  })

  it('o CTA "Abrir PDV" usa os tokens de marca', () => {
    renderNav()
    const pdv = link(ROUTES.caixa.home)
    expect(pdv.className).toContain('bg-primary')
    expect(pdv.className).toContain('text-primary-foreground')
  })

  it('nenhum link sobrescreve o anel de foco global (a:focus-visible, SSOT)', () => {
    const nav = renderNav()
    const comAnelProprio = Array.from(nav.querySelectorAll('a'))
      .map((a) => a.className)
      .filter((cls) => /focus-visible:(?:ring|outline)/.test(cls) || /\boutline-none\b/.test(cls))
    expect(comAnelProprio).toEqual([])
  })
})
