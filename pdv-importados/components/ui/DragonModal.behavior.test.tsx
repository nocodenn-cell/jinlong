/** @vitest-environment jsdom */
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
})

function render(ui: React.ReactElement) {
  flushSync(() => root.render(ui))
}

describe('DragonModal', () => {
  it('não renderiza quando open=false', () => {
    render(
      <DragonModal open={false} onClose={() => {}} title="Oi">
        corpo
      </DragonModal>,
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('renderiza com role/aria, trava o scroll e mostra footer', () => {
    render(
      <DragonModal open onClose={() => {}} title="Título" subtitle="Sub" footer={<button>Salvar</button>}>
        corpo
      </DragonModal>,
    )
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    // título referenciado por aria-labelledby
    const labelledby = dialog?.getAttribute('aria-labelledby')
    expect(labelledby).toBeTruthy()
    expect(document.getElementById(labelledby!)?.textContent).toBe('Título')
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.body.textContent).toContain('Salvar')
  })

  it('Escape, clique no backdrop e botão X disparam onClose', () => {
    const onClose = vi.fn()
    render(
      <DragonModal open onClose={onClose} title="T">
        corpo
      </DragonModal>,
    )

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = document.querySelector('.dragon-glass-backdrop') as HTMLElement
    backdrop.click()
    expect(onClose).toHaveBeenCalledTimes(2)

    const closeBtn = document.querySelector('[aria-label="Fechar"]') as HTMLElement
    closeBtn.click()
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('dismissable=false bloqueia Escape e backdrop (mas não o X)', () => {
    const onClose = vi.fn()
    render(
      <DragonModal open onClose={onClose} title="T" dismissable={false}>
        corpo
      </DragonModal>,
    )
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    const backdrop = document.querySelector('.dragon-glass-backdrop') as HTMLElement
    backdrop.click()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('restaura o overflow do body ao fechar', () => {
    render(
      <DragonModal open onClose={() => {}} title="T">
        corpo
      </DragonModal>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    render(
      <DragonModal open={false} onClose={() => {}} title="T">
        corpo
      </DragonModal>,
    )
    expect(document.body.style.overflow).toBe('')
  })
})
