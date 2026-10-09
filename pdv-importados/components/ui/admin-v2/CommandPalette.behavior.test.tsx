/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { CommandPalette, OPEN_COMMAND_PALETTE_EVENT } from './CommandPalette'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  push.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(admin = false, idioma: 'pt' | 'zh' = 'pt') {
  act(() => {
    root.render(<CommandPalette idioma={idioma} showAdminOnlyItems={admin} />)
  })
}
const dialog = () => container.querySelector('[data-testid="command-palette"]')
const input = () => container.querySelector<HTMLInputElement>('input[role="combobox"]')!
const options = () => Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'))
function tecla(key: string, init: KeyboardEventInit = {}, alvo: EventTarget = document) {
  act(() => {
    alvo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })
}
function digitar(valor: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input(), valor)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('CommandPalette (Ctrl+K)', () => {
  it('fica fechada até o atalho; Ctrl+K abre com o foco no campo e Ctrl+K de novo fecha', () => {
    render()
    expect(dialog()).toBeNull()
    tecla('k', { ctrlKey: true })
    expect(dialog()).not.toBeNull()
    expect(document.activeElement).toBe(input())
    tecla('k', { ctrlKey: true })
    expect(dialog()).toBeNull()
  })

  it('Cmd+K (Mac) também abre', () => {
    render()
    tecla('k', { metaKey: true })
    expect(dialog()).not.toBeNull()
  })

  it('o evento do botão abre a paleta', () => {
    render()
    act(() => {
      window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))
    })
    expect(dialog()).not.toBeNull()
  })

  it('"k" sem Ctrl não abre (não rouba digitação)', () => {
    render()
    tecla('k')
    expect(dialog()).toBeNull()
  })

  it('digitar filtra; Enter navega para o item ativo e fecha', () => {
    render()
    tecla('k', { ctrlKey: true })
    digitar('caix')
    expect(options()[0]?.getAttribute('data-href')).toBe('/admin/caixas')
    tecla('Enter', {}, input())
    expect(push).toHaveBeenCalledWith('/admin/caixas')
    expect(dialog()).toBeNull()
  })

  it('setas movem a seleção e Enter abre o segundo item', () => {
    render()
    tecla('k', { ctrlKey: true })
    const segundo = options()[1]!.getAttribute('data-href')
    tecla('ArrowDown', {}, input())
    expect(options()[1]!.getAttribute('aria-selected')).toBe('true')
    tecla('Enter', {}, input())
    expect(push).toHaveBeenCalledWith(segundo)
  })

  it('Esc fecha sem navegar', () => {
    render()
    tecla('k', { ctrlKey: true })
    tecla('Escape', {}, input())
    expect(dialog()).toBeNull()
    expect(push).not.toHaveBeenCalled()
  })

  it('clique em um resultado navega', () => {
    render()
    tecla('k', { ctrlKey: true })
    digitar('fornecedores')
    act(() => options()[0]!.click())
    expect(push).toHaveBeenCalledWith('/admin/fornecedores')
  })

  it('sem resultado mostra o estado vazio e Enter não navega', () => {
    render()
    tecla('k', { ctrlKey: true })
    digitar('zzzxxx')
    expect(options()).toHaveLength(0)
    expect(container.textContent).toContain('Nada encontrado')
    tecla('Enter', {}, input())
    expect(push).not.toHaveBeenCalled()
  })

  it('gerente não encontra ferramentas internas; ADMIN encontra', () => {
    render(false)
    tecla('k', { ctrlKey: true })
    digitar('provisionamento')
    expect(options()).toHaveLength(0)
    act(() => root.unmount())
    root = createRoot(container)
    render(true)
    tecla('k', { ctrlKey: true })
    digitar('provisionamento')
    expect(options()[0]?.getAttribute('data-href')).toBe('/admin/provisionamento')
  })

  it('é um diálogo modal acessível (combobox + listbox)', () => {
    render()
    tecla('k', { ctrlKey: true })
    expect(dialog()?.getAttribute('aria-modal')).toBe('true')
    expect(input().getAttribute('aria-controls')).toBe(container.querySelector('[role="listbox"]')?.id)
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0]!.id)
  })

  it('em chinês usa os textos em chinês', () => {
    render(false, 'zh')
    tecla('k', { ctrlKey: true })
    expect(input().placeholder).toBe('搜索页面和操作…')
  })
})
