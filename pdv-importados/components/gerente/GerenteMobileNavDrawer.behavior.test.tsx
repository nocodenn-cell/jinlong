/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/gerente/clientes',
}))

// next/link → <a> simples no jsdom
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { GerenteMobileNavDrawer } from '@/components/gerente/GerenteMobileNavDrawer'
import { getMessages } from '@/i18n/getMessages'

const m = getMessages('pt')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

function render(ui: React.ReactElement) {
  flushSync(() => root.render(ui))
}

function getHamburger(): HTMLButtonElement {
  return container.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement
}

describe('GerenteMobileNavDrawer (#33)', () => {
  it('renderiza só o hamburger (md:hidden) e nenhum dialog fechado', () => {
    render(<GerenteMobileNavDrawer m={m} userLabel="Gerente" />)
    const burger = getHamburger()
    expect(burger).not.toBeNull()
    expect(burger.className).toContain('md:hidden')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('abre o drawer, trava o scroll e lista itens de navegação', () => {
    render(<GerenteMobileNavDrawer m={m} userLabel="Gerente" />)
    flushSync(() => getHamburger().click())

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    // links de navegação presentes
    expect(dialog!.querySelectorAll('a').length).toBeGreaterThan(3)
    // marca a rota ativa (clientes) com aria-current
    expect(dialog!.querySelector('a[aria-current="page"]')).not.toBeNull()
  })

  it('Escape e clique no backdrop fecham; ao fechar restaura o scroll', () => {
    render(<GerenteMobileNavDrawer m={m} userLabel="Gerente" />)
    flushSync(() => getHamburger().click())
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    flushSync(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')

    // reabre e fecha pelo backdrop
    flushSync(() => getHamburger().click())
    const backdrop = document.querySelector('.dragon-glass-backdrop') as HTMLElement
    flushSync(() => backdrop.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('botão Sair chama onSignOut e fecha', () => {
    const onSignOut = vi.fn()
    render(<GerenteMobileNavDrawer m={m} userLabel="Gerente" onSignOut={onSignOut} />)
    flushSync(() => getHamburger().click())

    const sair = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(m.comum.sair),
    ) as HTMLButtonElement
    expect(sair).toBeTruthy()
    flushSync(() => sair.click())
    expect(onSignOut).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
