/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  usePathname: () => '/admin/categorias-produtos',
}))

vi.mock('@/app/gerente/categorias-produtos/actions', () => ({
  criarCategoriaProduto: vi.fn(),
  atualizarCategoriaProduto: vi.fn(),
  alternarAtivoCategoriaProduto: vi.fn(),
  excluirCategoriaProduto: vi.fn(),
}))

import { CategoriasProdutosContent } from './CategoriasProdutosContent'

const ROW = { id: 'cat-1', nome: 'Iluminação', ativo: true, categoria_pai_id: null, qtd_produtos: 3, created_at: '2026-01-01' }

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

describe('CategoriasProdutosContent — loadError honesto', () => {
  it('mostra o alerta de falha real quando loadError está presente', () => {
    render(
      <CategoriasProdutosContent
        dados={{ rows: [], total: 0 }}
        loadError="Não foi possível carregar as categorias."
        idioma="pt"
        filtroInicial={{ busca: '', situacao: 'todos', page: 1 }}
        pageSize={50}
      />,
    )
    const alerta = container.querySelector('[role="alert"]')
    expect(alerta).not.toBeNull()
    expect(alerta?.textContent).toContain('Não foi possível carregar')
  })

  it('sem loadError, não mostra o alerta de falha', () => {
    render(
      <CategoriasProdutosContent
        dados={{ rows: [ROW], total: 1 }}
        loadError={null}
        idioma="pt"
        filtroInicial={{ busca: '', situacao: 'todos', page: 1 }}
        pageSize={50}
      />,
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})

describe('CategoriasProdutosContent — paginação real', () => {
  it('rodapé de paginação não aparece quando total <= pageSize', () => {
    render(
      <CategoriasProdutosContent
        dados={{ rows: [ROW], total: 1 }}
        loadError={null}
        idioma="pt"
        filtroInicial={{ busca: '', situacao: 'todos', page: 1 }}
        pageSize={50}
      />,
    )
    expect(container.textContent).not.toContain('Página 1 de')
  })

  it('na primeira página, botão Anterior fica desabilitado; Próxima habilitado quando há mais páginas', () => {
    render(
      <CategoriasProdutosContent
        dados={{ rows: [ROW], total: 120 }}
        loadError={null}
        idioma="pt"
        filtroInicial={{ busca: '', situacao: 'todos', page: 1 }}
        pageSize={50}
      />,
    )
    const botoes = Array.from(container.querySelectorAll('button'))
    const anterior = botoes.find((b) => b.textContent === 'Anterior') as HTMLButtonElement
    const proxima = botoes.find((b) => b.textContent === 'Próxima') as HTMLButtonElement
    expect(anterior.disabled).toBe(true)
    expect(proxima.disabled).toBe(false)

    act(() => {
      proxima.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/categorias-produtos?page=2')
  })

  it('na última página, botão Próxima fica desabilitado', () => {
    render(
      <CategoriasProdutosContent
        dados={{ rows: [ROW], total: 120 }}
        loadError={null}
        idioma="pt"
        filtroInicial={{ busca: '', situacao: 'todos', page: 3 }}
        pageSize={50}
      />,
    )
    const botoes = Array.from(container.querySelectorAll('button'))
    const proxima = botoes.find((b) => b.textContent === 'Próxima') as HTMLButtonElement
    expect(proxima.disabled).toBe(true)
  })
})

describe('CategoriasProdutosContent — acessibilidade', () => {
  it('botão de editar tem nome acessível (aria-label), não apenas o ícone', () => {
    render(
      <CategoriasProdutosContent
        dados={{ rows: [ROW], total: 1 }}
        loadError={null}
        idioma="pt"
        filtroInicial={{ busca: '', situacao: 'todos', page: 1 }}
        pageSize={50}
      />,
    )
    const editar = container.querySelector('button[aria-label*="Editar categoria"]')
    expect(editar).not.toBeNull()
    const excluir = container.querySelector('button[aria-label*="Excluir"]')
    expect(excluir).not.toBeNull()
  })
})
