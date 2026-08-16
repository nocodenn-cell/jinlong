/** @vitest-environment jsdom */
/**
 * QA mobile funcional da sidebar (P0 do fluxo de produtos) — não apenas
 * estrutural: abrir/fechar, Escape, clique externo (backdrop), foco entrando
 * no drawer e retornando ao hamburger, bloqueio do scroll de fundo,
 * navegação fecha o drawer, e ausência de duplicidade do menu.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let currentPathname = '/admin/catalogo'

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    onClick?: () => void
  } & Record<string, unknown>) =>
    React.createElement('a', { href, onClick, ...rest }, children),
}))

const { AdminV2MobileNavDrawer } = await import('./AdminV2MobileNavDrawer')
const { getMessages } = await import('@/i18n/getMessages')

const fakeSession = {
  userId: 'user-1',
  user: { id: 'user-1', email: 'gerente@teste.local', user_metadata: {} },
  perfil: 'GERENTE',
  idioma: 'pt',
  lojaId: 'loja-1',
} as unknown as import('@/lib/admin/auth/types').AdminSession

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  currentPathname = '/admin/catalogo'
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

function render() {
  const m = getMessages('pt')
  act(() => {
    root.render(
      React.createElement(AdminV2MobileNavDrawer, {
        session: fakeSession,
        m,
        chineseLanguage: false,
      }),
    )
  })
}

function hamburger(): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
  expect(btn).not.toBeNull()
  return btn!
}

function dialog(): HTMLElement | null {
  return container.querySelector('[role="dialog"]')
}

describe('AdminV2MobileNavDrawer — abrir e fechar', () => {
  it('começa fechado: sem dialog no DOM, hamburger com aria-expanded=false', () => {
    render()
    expect(dialog()).toBeNull()
    expect(hamburger().getAttribute('aria-expanded')).toBe('false')
  })

  it('clique no hamburger abre o drawer', () => {
    render()
    act(() => hamburger().click())
    expect(dialog()).not.toBeNull()
    expect(hamburger().getAttribute('aria-expanded')).toBe('true')
  })

  it('clique no botão fechar (X) fecha o drawer', () => {
    render()
    act(() => hamburger().click())
    const closeBtn = dialog()!.querySelector<HTMLButtonElement>('button[aria-label]')
    act(() => closeBtn?.click())
    expect(dialog()).toBeNull()
  })

  it('Escape fecha o drawer', () => {
    render()
    act(() => hamburger().click())
    expect(dialog()).not.toBeNull()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(dialog()).toBeNull()
  })

  it('clique no backdrop (fora do painel) fecha o drawer', () => {
    render()
    act(() => hamburger().click())
    const backdrop = dialog()!.querySelector<HTMLElement>('.dragon-glass-backdrop')
    expect(backdrop).not.toBeNull()
    act(() => backdrop!.click())
    expect(dialog()).toBeNull()
  })

  it('navegar (mudança de pathname) fecha o drawer automaticamente', () => {
    render()
    act(() => hamburger().click())
    expect(dialog()).not.toBeNull()
    currentPathname = '/admin/estoque'
    render() // re-render simula a troca de rota via next/navigation
    expect(dialog()).toBeNull()
  })
})

describe('AdminV2MobileNavDrawer — foco', () => {
  it('ao abrir, o foco entra no drawer (botão fechar)', () => {
    render()
    act(() => hamburger().click())
    const closeBtn = dialog()!.querySelector<HTMLButtonElement>('button[aria-label]')
    expect(document.activeElement).toBe(closeBtn)
  })

  it('ao fechar (Escape), o foco volta pro hamburger', () => {
    render()
    act(() => hamburger().click())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.activeElement).toBe(hamburger())
  })

  it('no carregamento inicial (nunca aberto), o hamburger NÃO rouba foco da página sozinho', () => {
    render()
    expect(document.activeElement).not.toBe(hamburger())
  })

  it('Tab no último elemento focável do drawer cicla de volta pro primeiro (trap)', () => {
    render()
    act(() => hamburger().click())
    const focusables = dialog()!.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    expect(focusables.length).toBeGreaterThan(1)
    const last = focusables[focusables.length - 1]!
    const first = focusables[0]!
    act(() => last.focus())
    act(() => {
      const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      document.dispatchEvent(evt)
    })
    expect(document.activeElement).toBe(first)
  })
})

describe('AdminV2MobileNavDrawer — bloqueio de scroll e item ativo', () => {
  it('trava o scroll do body enquanto aberto e restaura ao fechar', () => {
    render()
    expect(document.body.style.overflow).toBe('')
    act(() => hamburger().click())
    expect(document.body.style.overflow).toBe('hidden')
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.body.style.overflow).toBe('')
  })

  it('marca o item de nav correspondente à rota atual como ativo (aria-current)', () => {
    currentPathname = '/admin/catalogo'
    render()
    act(() => hamburger().click())
    const active = dialog()!.querySelector('[aria-current="page"]')
    expect(active).not.toBeNull()
    expect(active?.getAttribute('href')).toBe('/admin/catalogo')
  })
})

describe('AdminV2MobileNavDrawer — sem duplicidade de menu', () => {
  it('só existe UMA instância de cada link de navegação dentro do <nav> do drawer (SidebarNav não duplica itens)', () => {
    render()
    act(() => hamburger().click())
    // Escopo só o <nav> da SidebarNav — o cabeçalho do drawer também tem um
    // link (logo → dashboard), que legitimamente repete o href de "Visão
    // geral" da nav; isso não é duplicidade de menu, é logo + item de menu
    // apontando pro mesmo lugar (padrão comum e intencional).
    const nav = dialog()!.querySelector('nav')
    expect(nav).not.toBeNull()
    const hrefs = Array.from(nav!.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'))
    expect(hrefs.length).toBeGreaterThan(0)
    const unicos = new Set(hrefs)
    expect(hrefs.length).toBe(unicos.size)
  })

  it('a sidebar desktop (<aside>) não está presente dentro do drawer mobile — não há duplicação da estrutura inteira', () => {
    render()
    act(() => hamburger().click())
    expect(dialog()!.querySelector('aside')).toBeNull()
  })
})
