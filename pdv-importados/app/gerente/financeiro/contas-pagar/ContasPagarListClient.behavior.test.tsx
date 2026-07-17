/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IntersectionObserverStub

vi.mock('./actions', () => ({
  buscarContasPagarAction: vi.fn(),
  cancelarContaPagarAction: vi.fn(),
  exportarContasPagarParaCSVAction: vi.fn(),
}))

import { ContasPagarListClient } from '@/app/gerente/financeiro/contas-pagar/ContasPagarListClient'

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui)
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe('ContasPagarListClient — falha de carga inicial', () => {
  it('mostra o alerta de falha real (não "sem contas") quando loadErrorInicial está presente', () => {
    render(
      <ContasPagarListClient
        idioma="pt"
        locale="pt-BR"
        contasIniciais={[]}
        hasMoreInicial={false}
        fornecedoresOpts={[]}
        statusInicial="todos"
        periodoInicial=""
        loadErrorInicial="Não foi possível carregar contas a pagar. Tente novamente."
      />,
    )
    const alerta = container.querySelector('[role="alert"]')
    expect(alerta).not.toBeNull()
    expect(alerta?.textContent).toContain('Não foi possível carregar')
  })

  it('sem loadErrorInicial, não mostra o alerta de falha', () => {
    render(
      <ContasPagarListClient
        idioma="pt"
        locale="pt-BR"
        contasIniciais={[]}
        hasMoreInicial={false}
        fornecedoresOpts={[]}
        statusInicial="todos"
        periodoInicial=""
      />,
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})
