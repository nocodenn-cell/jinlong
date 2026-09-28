/** @vitest-environment jsdom */
/**
 * E3 — o estado vazio de Contas a pagar dizia "…ou lance uma nova conta a
 * pagar", mas o Jinlong não tem lançamento manual: os títulos só nascem da
 * importação de NF-e (a própria tela avisa "sem lançamento manual"). A
 * mensagem não pode prometer uma operação que o sistema não oferece.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Idioma } from '@/idioma/normalizeIdioma'

vi.mock('./actions', () => ({
  buscarContasPagarAction: vi.fn(),
  cancelarContaPagarAction: vi.fn(),
  exportarContasPagarParaCSVAction: vi.fn(),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { ContasPagarListClient } = await import('./ContasPagarListClient')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  class IOStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', IOStub)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function renderVazio(idioma: Idioma) {
  flushSync(() =>
    root.render(
      <ContasPagarListClient
        idioma={idioma}
        locale={idioma === 'pt' ? 'pt-BR' : 'zh-CN'}
        contasIniciais={[]}
        hasMoreInicial={false}
        fornecedoresOpts={[]}
        statusInicial="todos"
        periodoInicial=""
      />,
    ),
  )
}

describe('ContasPagarListClient — estado vazio não promete lançamento manual (E3)', () => {
  it('pt: explica de onde vêm as contas, sem sugerir "lançar" uma nova', () => {
    renderVazio('pt')

    const texto = container.textContent ?? ''
    expect(texto).toContain('Nenhuma conta encontrada')
    expect(texto).toContain('geradas ao importar uma NF-e de compra')
    expect(texto.toLowerCase()).not.toContain('lance uma nova')
  })

  it('zh: idem — sem sugerir "新增" (adicionar) uma conta a pagar', () => {
    renderVazio('zh')

    const texto = container.textContent ?? ''
    expect(texto).toContain('NF-e')
    expect(texto).not.toContain('新增')
  })
})
