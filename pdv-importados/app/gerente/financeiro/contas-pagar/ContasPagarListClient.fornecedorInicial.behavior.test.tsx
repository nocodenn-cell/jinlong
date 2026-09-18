/** @vitest-environment jsdom */
/**
 * BP-E1 (D5) — quando a aba "A pagar" abre por deep-link com `fornecedorInicial`
 * (NF-e concluída, ficha de Fornecedores), o filtro de fornecedor já nasce
 * aplicado e visível no <select>, sem refazer a busca que o servidor já fez.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const buscarContasPagarMock = vi.fn()

vi.mock('./actions', () => ({
  buscarContasPagarAction: (...a: unknown[]) => buscarContasPagarMock(...a),
  cancelarContaPagarAction: vi.fn(),
  exportarContasPagarParaCSVAction: vi.fn(),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const { ContasPagarListClient } = await import('./ContasPagarListClient')

const conta = {
  id: 'c1',
  fornecedor_id: 'forn-alvo',
  fornecedor_nome: 'Fornecedor Alvo',
  descricao: 'Compra de mercadoria',
  valor_total: 100,
  valor_pago: 0,
  vencimento: '2026-09-30',
  status: 'PENDENTE' as const,
  nfe_numero: null,
  nfe_importacao_id: null,
  criado_em: '2026-09-17T10:00:00Z',
  loja_id: 'loja-1',
  atrasado: false,
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  buscarContasPagarMock.mockReset()
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

function renderizar(fornecedorInicial?: string) {
  flushSync(() =>
    root.render(
      <ContasPagarListClient
        idioma="pt"
        locale="pt-BR"
        contasIniciais={[conta]}
        hasMoreInicial={false}
        fornecedoresOpts={[
          { id: 'forn-alvo', nome: 'Fornecedor Alvo' },
          { id: 'forn-outro', nome: 'Outro Fornecedor' },
        ]}
        statusInicial="todos"
        periodoInicial=""
        fornecedorInicial={fornecedorInicial}
      />,
    ),
  )
}

function selectDeFornecedor(): HTMLSelectElement {
  const sel = Array.from(container.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.value === 'forn-alvo'),
  )
  expect(sel).toBeTruthy()
  return sel as HTMLSelectElement
}

describe('ContasPagarListClient — fornecedorInicial (BP-E1/D5)', () => {
  it('nasce com o fornecedor do link selecionado e sem refazer a busca', () => {
    renderizar('forn-alvo')

    expect(selectDeFornecedor().value).toBe('forn-alvo')
    expect(buscarContasPagarMock).not.toHaveBeenCalled()
  })

  it('sem fornecedorInicial: o filtro começa em "todos os fornecedores"', () => {
    renderizar(undefined)

    expect(selectDeFornecedor().value).toBe('')
  })
})
