/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { CaixaOperadorContextBar } from '@/app/caixa/CaixaOperadorContextBar'

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

const m = getMessages('pt')

describe('CaixaOperadorContextBar (RM-09 — cliente como ação de primeira classe, não só Alt+C)', () => {
  it('sem cliente vinculado e sem callback, não renderiza nada (compat retroativa)', () => {
    act(() => {
      root.render(<CaixaOperadorContextBar m={m} idioma="pt" clienteNome={null} />)
    })
    expect(container.textContent).toBe('')
  })

  it('sem cliente vinculado, mostra um CTA visível para selecionar um', () => {
    const onSelecionarCliente = vi.fn()
    act(() => {
      root.render(
        <CaixaOperadorContextBar
          m={m}
          idioma="pt"
          clienteNome={null}
          onSelecionarCliente={onSelecionarCliente}
        />,
      )
    })
    const btn = container.querySelector('[data-testid="caixa-btn-selecionar-cliente"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    expect(btn.textContent).toContain(m.caixa.selecionar_cliente_titulo)
    act(() => btn.click())
    expect(onSelecionarCliente).toHaveBeenCalledTimes(1)
  })

  it('com cliente vinculado, mostra o chip existente em vez do CTA', () => {
    act(() => {
      root.render(
        <CaixaOperadorContextBar
          m={m}
          idioma="pt"
          clienteNome="Mercado São Jorge"
          onSelecionarCliente={vi.fn()}
        />,
      )
    })
    expect(container.querySelector('[data-testid="caixa-chip-cliente"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="caixa-btn-selecionar-cliente"]')).toBeNull()
    expect(container.textContent).toContain('Mercado São Jorge')
  })
})
