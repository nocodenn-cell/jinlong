/** @vitest-environment jsdom */
/**
 * G-03 — deep-link "Fornecedor → Nova OC". `fornecedorPreSelecionado` deve
 * inicializar o select de fornecedor da OC nova; `ocInicial` (edição)
 * sempre vence quando presente.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/gerente/compras/actions', () => ({
  criarOrdemCompra: vi.fn(),
  atualizarOrdemCompra: vi.fn(),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

const { OcFormModal } = await import('./OcFormModal')

const fornecedores = [
  { id: 'forn-1', nome: 'Fornecedor Alfa' },
  { id: 'forn-2', nome: 'Fornecedor Beta' },
]

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

describe('OcFormModal — fornecedorPreSelecionado (G-03)', () => {
  it('nova OC sem pré-seleção: select começa vazio (comportamento atual preservado)', () => {
    act(() => {
      root.render(
        <OcFormModal
          idioma="pt"
          ocInicial={null}
          fornecedores={fornecedores}
          produtos={[]}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      )
    })
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('nova OC com fornecedorPreSelecionado: select já vem com o fornecedor certo', () => {
    act(() => {
      root.render(
        <OcFormModal
          idioma="pt"
          ocInicial={null}
          fornecedores={fornecedores}
          produtos={[]}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          fornecedorPreSelecionado="forn-2"
        />,
      )
    })
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('forn-2')
  })

  it('editando uma OC existente: fornecedor da OC vence, mesmo com fornecedorPreSelecionado presente', () => {
    const ocInicial = {
      id: 'oc-1',
      fornecedor_id: 'forn-1',
      fornecedor_nome: 'Fornecedor Alfa',
      status: 'RASCUNHO' as const,
      data_emissao: '2026-09-17',
      data_prevista_chegada: null,
      observacao: null,
      total_itens: 0,
      valor_total: 0,
      created_at: '2026-09-17T00:00:00Z',
      itens: [],
    }
    act(() => {
      root.render(
        <OcFormModal
          idioma="pt"
          ocInicial={ocInicial}
          fornecedores={fornecedores}
          produtos={[]}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          fornecedorPreSelecionado="forn-2"
        />,
      )
    })
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('forn-1')
  })
})
