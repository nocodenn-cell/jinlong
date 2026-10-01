/** @vitest-environment jsdom */
/** UX-019 / P-24 — abrir caixa mostra o operador e o valor do fundo com prefixo de moeda (R$). */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { CaixaAbrirTurnoModal } from './CaixaAbrirTurnoModal'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const m = getMessages('pt')
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('CaixaAbrirTurnoModal (UX-019)', () => {
  it('mostra o nome do operador e o prefixo R$ ao lado do fundo; confirma com o valor digitado', () => {
    const onConfirm = vi.fn()
    act(() =>
      root.render(
        <CaixaAbrirTurnoModal
          open
          onOpenChange={() => {}}
          m={m}
          operadorLabel="Ana Souza"
          parseValor={(raw) => Number(raw.replace(',', '.'))}
          onConfirm={onConfirm}
        />,
      ),
    )
    expect(document.body.textContent).toContain('Ana Souza')
    expect(document.querySelector('[data-testid="abrir-turno-moeda"]')!.textContent).toBe('R$')
    const input = document.querySelector('input') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(input, '50,5')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const abrir = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === m.caixa.abrir)!
    act(() => abrir.click())
    expect(onConfirm).toHaveBeenCalledWith(50.5)
  })
})
