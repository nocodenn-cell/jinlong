/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AdminV2SidebarFrame, SIDEBAR_COLLAPSED_STORAGE_KEY } from './AdminV2SidebarFrame'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

function mount() {
  act(() => {
    root.render(
      <AdminV2SidebarFrame labelRecolher="Recolher menu" labelExpandir="Expandir menu">
        <span className="admin-v2-nav-label">Produtos</span>
      </AdminV2SidebarFrame>,
    )
  })
}
const aside = () => host.querySelector('[data-testid="admin-v2-sidebar"]') as HTMLElement
const toggle = () => host.querySelector('[data-testid="admin-v2-sidebar-toggle"]') as HTMLButtonElement

describe('AdminV2SidebarFrame', () => {
  beforeEach(() => {
    window.localStorage.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('começa expandido e mantém o landmark de navegação', () => {
    mount()
    expect(aside().getAttribute('role')).toBe('complementary')
    expect(aside().getAttribute('aria-label')).toBe('Navegação')
    expect(aside().getAttribute('data-collapsed')).toBe('false')
    expect(aside().className).toContain('lg:w-72')
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(toggle().getAttribute('aria-label')).toBe('Recolher menu')
  })

  it('recolhe, persiste a preferência e volta a expandir', () => {
    mount()
    act(() => toggle().click())
    expect(aside().getAttribute('data-collapsed')).toBe('true')
    expect(aside().className).not.toContain('lg:w-72')
    expect(toggle().getAttribute('aria-label')).toBe('Expandir menu')
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('1')
    // rótulo continua no DOM (acessível); só o CSS o oculta
    expect(host.textContent).toContain('Produtos')
    act(() => toggle().click())
    expect(aside().getAttribute('data-collapsed')).toBe('false')
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('0')
  })

  it('restaura o estado recolhido salvo', () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, '1')
    mount()
    expect(aside().getAttribute('data-collapsed')).toBe('true')
  })

  it('continua oculto abaixo de lg (mobile usa o drawer)', () => {
    mount()
    expect(aside().className).toMatch(/(^|\s)hidden(\s|$)/)
    expect(aside().className).toContain('lg:flex')
  })
})
