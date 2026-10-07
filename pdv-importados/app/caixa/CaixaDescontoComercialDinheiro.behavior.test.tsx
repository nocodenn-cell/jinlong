/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaixaDescontoComercialDinheiro } from './CaixaDescontoComercialDinheiro'
import { calcularDescontoComercialDinheiro } from './descontoComercialDinheiro'

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

function renderGaveta(props?: {
  subtotal?: number
  descontoPercentualAtual?: number
  onSolicitar?: (pct: number) => void
  onLimpar?: () => void
}) {
  const onSolicitar = props?.onSolicitar ?? vi.fn()
  const onLimpar = props?.onLimpar ?? vi.fn()
  flushSync(() => {
    root.render(
      <CaixaDescontoComercialDinheiro
        idioma="pt"
        subtotal={props?.subtotal ?? 100}
        descontoPercentualAtual={props?.descontoPercentualAtual ?? 0}
        onSolicitar={onSolicitar}
        onLimpar={onLimpar}
      />,
    )
  })
  return {
    onSolicitar,
    onLimpar,
    gaveta: container.querySelector(
      '[data-testid="caixa-desconto-comercial-dinheiro"]',
    ) as HTMLDetailsElement,
  }
}

describe('CaixaDescontoComercialDinheiro — gaveta colapsável', () => {
  it('inicia fechada (sem atributo open)', () => {
    const { gaveta } = renderGaveta()
    expect(gaveta).toBeTruthy()
    expect(gaveta.tagName).toBe('DETAILS')
    expect(gaveta.open).toBe(false)
    expect(gaveta.hasAttribute('open')).toBe(false)
  })

  it('clique no summary abre; segundo clique fecha', () => {
    const { gaveta } = renderGaveta()
    const summary = gaveta.querySelector('summary')
    expect(summary).toBeTruthy()

    summary!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(gaveta.open).toBe(true)

    summary!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(gaveta.open).toBe(false)
  })

  it('preserva cálculo comercial ao aplicar 10% rápido', () => {
    const onSolicitar = vi.fn()
    const { gaveta } = renderGaveta({ subtotal: 200, onSolicitar })
    gaveta.open = true

    const esperado = calcularDescontoComercialDinheiro({
      subtotal: 200,
      modo: 'percentual',
      valor: 10,
    })
    expect(esperado.ok).toBe(true)
    expect(esperado.percentual).toBe(10)
    expect(esperado.descontoValor).toBe(20)
    expect(esperado.totalFinal).toBe(180)

    const botaoRapido = Array.from(container.querySelectorAll('button')).find((b) =>
      /10% de desconto no dinheiro/i.test(b.textContent ?? ''),
    )
    expect(botaoRapido).toBeTruthy()
    botaoRapido!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSolicitar).toHaveBeenCalledWith(10)
  })
})
