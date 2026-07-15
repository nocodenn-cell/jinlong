/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCaixaKeyboardShortcuts } from '@/app/caixa/hooks/useCaixaKeyboardShortcuts'

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
})

const noop = () => {}

function Harness({
  onSelecionarMetodo,
}: {
  onSelecionarMetodo: (i: 1 | 2 | 3 | 4) => void
}) {
  useCaixaKeyboardShortcuts({
    caixaAberto: true,
    movimentandoCaixa: false,
    onAbrirSuprimento: noop,
    onAbrirSangria: noop,
    onFinalizar: noop,
    onFecharCaixa: noop,
    onFocarBusca: noop,
    onNovoCupom: noop,
    onSelecionarMetodo,
  })
  return <input data-testid="campo" />
}

function mount(el: React.ReactElement) {
  flushSync(() => root.render(el))
}

describe('useCaixaKeyboardShortcuts — teclas de método 1-4', () => {
  it('dispara onSelecionarMetodo com o índice correspondente (Digit/Numpad)', () => {
    const cb = vi.fn()
    mount(<Harness onSelecionarMetodo={cb} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Numpad3' }))
    expect(cb.mock.calls.map((c) => c[0])).toEqual([1, 4, 3])
  })

  it('NÃO dispara quando o foco está num campo de texto (não atrapalha o código de barras)', () => {
    const cb = vi.fn()
    mount(<Harness onSelecionarMetodo={cb} />)
    const campo = container.querySelector('[data-testid="campo"]') as HTMLInputElement
    campo.focus()
    campo.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', bubbles: true }))
    expect(cb).not.toHaveBeenCalled()
  })

  it('NÃO dispara com modificadores (ex.: Ctrl+1)', () => {
    const cb = vi.fn()
    mount(<Harness onSelecionarMetodo={cb} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', ctrlKey: true }))
    expect(cb).not.toHaveBeenCalled()
  })
})
