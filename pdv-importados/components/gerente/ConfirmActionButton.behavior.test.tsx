/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmActionButton } from './ConfirmActionButton'

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
  vi.unstubAllGlobals()
})

const tick = () => new Promise((r) => setTimeout(r, 0))
const clicar = (el: Element | null) => {
  if (!el) throw new Error('elemento não encontrado')
  flushSync(() => (el as HTMLElement).click())
}
const botao = (texto: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent === texto) ?? null

describe('ConfirmActionButton (diálogo do Design System)', () => {
  it('type=button: só chama onClick depois de Confirmar, sem confirm() nativo', async () => {
    const nativo = vi.fn()
    vi.stubGlobal('confirm', nativo)
    const onClick = vi.fn()
    flushSync(() =>
      root.render(
        <ConfirmActionButton type="button" confirmMessage="Excluir fornecedor X?" onClick={onClick}>
          Excluir
        </ConfirmActionButton>,
      ),
    )
    clicar(botao('Excluir'))
    expect(document.body.textContent).toContain('Excluir fornecedor X?')
    expect(onClick).not.toHaveBeenCalled()
    clicar(document.querySelector('[data-testid="confirm-dialog-confirmar"]'))
    await tick()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(nativo).not.toHaveBeenCalled()
  })

  it('Cancelar não chama onClick', async () => {
    const onClick = vi.fn()
    flushSync(() =>
      root.render(
        <ConfirmActionButton type="button" confirmMessage="Excluir?" onClick={onClick}>
          Excluir
        </ConfirmActionButton>,
      ),
    )
    clicar(botao('Excluir'))
    clicar(botao('Cancelar'))
    await tick()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('submit: o formulário só é enviado após Confirmar', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    flushSync(() =>
      root.render(
        <form onSubmit={onSubmit}>
          <ConfirmActionButton confirmMessage="Apagar?">Apagar</ConfirmActionButton>
        </form>,
      ),
    )
    // jsdom não implementa requestSubmit em todas as versões: garante o comportamento padrão.
    if (!HTMLFormElement.prototype.requestSubmit) {
      HTMLFormElement.prototype.requestSubmit = function (this: HTMLFormElement) {
        this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      }
    }
    clicar(botao('Apagar'))
    expect(onSubmit).not.toHaveBeenCalled()
    clicar(document.querySelector('[data-testid="confirm-dialog-confirmar"]'))
    await tick()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
