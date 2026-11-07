/** @vitest-environment jsdom */
/**
 * Roadmap UX, Tarefa 4 — gaveta lateral como variante do primitivo único de diálogo.
 *
 * `placement="drawer"`: ancorada à direita, tela cheia no mobile, 480 px (sm/md) ou
 * 640 px (lg/xl) a partir de `sm`, header fixo, só o corpo rola, footer fixo com as
 * ações. ESC, backdrop, foco e trava de scroll são os mesmos do diálogo central.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DragonModal } from '@/components/ui/DragonModal'

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
  vi.restoreAllMocks()
})

function render(ui: React.ReactElement) {
  flushSync(() => root.render(ui))
}

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement
const painel = () => dialog().querySelector('[data-dragon-panel]') as HTMLElement

function gaveta(props: Partial<React.ComponentProps<typeof DragonModal>> = {}) {
  return (
    <DragonModal
      open
      onClose={() => {}}
      title="Venda #123"
      placement="drawer"
      footer={<button type="button">Reimprimir</button>}
      {...props}
    >
      <p>linha 1</p>
    </DragonModal>
  )
}

describe('DragonModal placement="drawer"', () => {
  it('ancora à direita e ocupa a tela inteira no mobile', () => {
    render(gaveta())
    expect(dialog().getAttribute('data-placement')).toBe('drawer')
    expect(dialog().classList.contains('justify-end')).toBe(true)
    expect(dialog().classList.contains('items-center')).toBe(false)
    for (const cls of ['h-full', 'w-full']) expect(painel().classList.contains(cls)).toBe(true)
    // nada de cartão flutuante: sem cantos e sem limite de 90vh
    expect(painel().className).not.toMatch(/rounded-2xl|max-h-\[90vh\]/)
  })

  it('largura desktop: 480 px no md (default) e 640 px no lg', () => {
    render(gaveta())
    expect(painel().classList.contains('sm:max-w-[480px]')).toBe(true)
    render(gaveta({ size: 'lg' }))
    expect(painel().classList.contains('sm:max-w-[640px]')).toBe(true)
    expect(painel().classList.contains('sm:max-w-[480px]')).toBe(false)
  })

  it('header fixo e footer fixo: só o corpo rola', () => {
    render(gaveta())
    const corpo = painel().querySelector('[data-dragon-body]') as HTMLElement
    const header = painel().querySelector('[data-dragon-header]') as HTMLElement
    const footer = painel().querySelector('[data-dragon-footer]') as HTMLElement
    expect(corpo.className).toContain('overflow-y-auto')
    expect(corpo.textContent).toBe('linha 1')
    expect(corpo.contains(header)).toBe(false)
    expect(corpo.contains(footer)).toBe(false)
    expect(header.textContent).toContain('Venda #123')
    expect(footer.textContent).toBe('Reimprimir')
    // ordem visual: header → corpo → footer
    expect(Array.from(painel().children)).toEqual([header, corpo, footer])
  })

  it('ESC, backdrop e X fecham; dismissable=false segura ESC e backdrop', () => {
    const onClose = vi.fn()
    render(gaveta({ onClose }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    ;(dialog().querySelector('.dragon-glass-backdrop') as HTMLElement).click()
    ;(dialog().querySelector('button[aria-label="Fechar"]') as HTMLButtonElement).click()
    expect(onClose).toHaveBeenCalledTimes(3)

    onClose.mockClear()
    render(gaveta({ onClose, dismissable: false }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    ;(dialog().querySelector('.dragon-glass-backdrop') as HTMLElement).click()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('acessível: role dialog, aria-modal e título rotulando a gaveta; trava o scroll', () => {
    render(gaveta())
    expect(dialog().getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog().getAttribute('aria-labelledby')!)?.textContent).toBe('Venda #123')
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('foco vai para a gaveta ao abrir e volta ao gatilho ao fechar', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
    const gatilho = document.createElement('button')
    document.body.appendChild(gatilho)
    gatilho.focus()

    render(gaveta())
    expect(painel().contains(document.activeElement)).toBe(true)

    render(gaveta({ open: false }))
    expect(document.activeElement).toBe(gatilho)
    expect(document.body.style.overflow).toBe('')
    gatilho.remove()
  })

  it('Tab cicla dentro da gaveta (do último focável volta ao primeiro)', () => {
    render(gaveta())
    const focaveis = Array.from(painel().querySelectorAll('button'))
    focaveis[focaveis.length - 1].focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(focaveis[0])
  })

  it('sem placement continua o diálogo central de sempre (regressão)', () => {
    render(
      <DragonModal open onClose={() => {}} title="Oi">
        corpo
      </DragonModal>,
    )
    expect(dialog().getAttribute('data-placement')).toBe('center')
    expect(dialog().classList.contains('items-center')).toBe(true)
    expect(painel().className).toContain('rounded-2xl')
    expect(painel().className).toContain('max-w-md')
  })
})
