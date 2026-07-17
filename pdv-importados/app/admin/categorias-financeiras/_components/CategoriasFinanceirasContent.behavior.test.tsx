/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  usePathname: () => '/admin/categorias-financeiras',
}))

vi.mock('@/app/gerente/categorias-financeiras/actions', () => ({
  criarCategoriaFinanceira: vi.fn(),
  atualizarCategoriaFinanceira: vi.fn(),
  alternarAtivoCategoriaFinanceira: vi.fn(),
  excluirCategoriaFinanceira: vi.fn(),
}))

import { CategoriasFinanceirasContent } from './CategoriasFinanceirasContent'

const ROW = { id: 'catfin-1', nome: 'Vendas', tipo: 'RECEITA' as const, ativo: true, created_at: '2026-01-01' }

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui)
  })
}

beforeEach(() => {
  pushMock.mockClear()
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

describe('CategoriasFinanceirasContent — loadError honesto', () => {
  it('mostra o alerta de falha real quando loadError está presente', () => {
    render(
      <CategoriasFinanceirasContent
        dados={{ rows: [], total: 0 }}
        loadError="Não foi possível carregar as categorias."
        idioma="pt"
        filtroInicial={{ busca: '', tipo: 'todos', situacao: 'todos', page: 1 }}
        pageSize={50}
      />,
    )
    const alerta = container.querySelector('[role="alert"]')
    expect(alerta).not.toBeNull()
    expect(alerta?.textContent).toContain('Não foi possível carregar')
  })

  it('sem loadError, não mostra o alerta de falha', () => {
    render(
      <CategoriasFinanceirasContent
        dados={{ rows: [ROW], total: 1 }}
        loadError={null}
        idioma="pt"
        filtroInicial={{ busca: '', tipo: 'todos', situacao: 'todos', page: 1 }}
        pageSize={50}
      />,
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})

describe('CategoriasFinanceirasContent — filtro de tipo navega via URL', () => {
  it('selecionar um tipo dispara router.push com o parâmetro tipo', () => {
    render(
      <CategoriasFinanceirasContent
        dados={{ rows: [ROW], total: 1 }}
        loadError={null}
        idioma="pt"
        filtroInicial={{ busca: '', tipo: 'todos', situacao: 'todos', page: 1 }}
        pageSize={50}
      />,
    )
    const select = container.querySelector('select[aria-label="TIPO"]') as HTMLSelectElement
    expect(select).not.toBeNull()

    act(() => {
      select.value = 'DESPESA'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/categorias-financeiras?tipo=DESPESA')
  })
})

describe('CategoriasFinanceirasContent — paginação real', () => {
  it('na última página, botão Próxima fica desabilitado', () => {
    render(
      <CategoriasFinanceirasContent
        dados={{ rows: [ROW], total: 60 }}
        loadError={null}
        idioma="pt"
        filtroInicial={{ busca: '', tipo: 'todos', situacao: 'todos', page: 2 }}
        pageSize={50}
      />,
    )
    const botoes = Array.from(container.querySelectorAll('button'))
    const proxima = botoes.find((b) => b.textContent === 'Próxima') as HTMLButtonElement
    expect(proxima.disabled).toBe(true)
  })
})

describe('CategoriasFinanceirasContent — acessibilidade', () => {
  it('botão de editar e excluir têm nome acessível (aria-label)', () => {
    render(
      <CategoriasFinanceirasContent
        dados={{ rows: [ROW], total: 1 }}
        loadError={null}
        idioma="pt"
        filtroInicial={{ busca: '', tipo: 'todos', situacao: 'todos', page: 1 }}
        pageSize={50}
      />,
    )
    expect(container.querySelector('button[aria-label*="Editar categoria"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label*="Excluir"]')).not.toBeNull()
  })
})
