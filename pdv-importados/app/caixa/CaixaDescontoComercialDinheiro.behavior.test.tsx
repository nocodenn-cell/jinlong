/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaixaDescontoComercialDinheiro } from './CaixaDescontoComercialDinheiro'

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

describe('CaixaDescontoComercialDinheiro — gaveta', () => {
  it('fica fechada por padrão e só mostra o formulário ao abrir', () => {
    flushSync(() => {
      root.render(
        <CaixaDescontoComercialDinheiro
          idioma="pt"
          subtotal={100}
          descontoPercentualAtual={0}
          onSolicitar={vi.fn()}
          onLimpar={vi.fn()}
        />,
      )
    })

    const gaveta = container.querySelector(
      '[data-testid="caixa-desconto-comercial-dinheiro"]',
    ) as HTMLDetailsElement
    expect(gaveta).toBeTruthy()
    expect(gaveta.tagName).toBe('DETAILS')
    expect(gaveta.open).toBe(false)

    const applyClosed = Array.from(container.querySelectorAll('button')).find((b) =>
      /Aplicar desconto/i.test(b.textContent ?? ''),
    )
    // Conteúdo existe no DOM, mas a gaveta começa fechada (details sem open).
    expect(applyClosed).toBeTruthy()
    expect(gaveta.open).toBe(false)

    gaveta.open = true
    expect(gaveta.open).toBe(true)
    expect(container.textContent).toContain('Aplicar desconto')
  })

  it('mostra badge quando já há desconto aplicado', () => {
    flushSync(() => {
      root.render(
        <CaixaDescontoComercialDinheiro
          idioma="pt"
          subtotal={100}
          descontoPercentualAtual={10}
          onSolicitar={vi.fn()}
          onLimpar={vi.fn()}
        />,
      )
    })
    expect(container.textContent).toMatch(/10% aplicado/i)
  })
})
