/** @vitest-environment jsdom */
/**
 * Regressão A3 (Sprint UX Onda 1): renomear/(in)ativar uma categoria só
 * atualizava o estado local do React — sem `router.refresh()`, a navegação
 * client-side para outra tela e volta ainda servia o Router Cache antigo.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const routerRefreshMock = vi.fn()
const atualizarCategoriaProdutoMock = vi.fn()
const alternarAtivoCategoriaProdutoMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock, push: vi.fn() }),
}))

vi.mock('@/app/gerente/categorias-produtos/actions', () => ({
  criarCategoriaProduto: vi.fn(),
  atualizarCategoriaProduto: (...args: unknown[]) => atualizarCategoriaProdutoMock(...args),
  alternarAtivoCategoriaProduto: (...args: unknown[]) => alternarAtivoCategoriaProdutoMock(...args),
}))

const { CategoriasProdutosContent } = await import('./CategoriasProdutosContent')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  nome: 'Eletrônicos',
  ativo: true,
  categoria_pai_id: null,
  qtd_produtos: 3,
  created_at: '2026-01-01T00:00:00Z',
}

function renderContent() {
  act(() => {
    root.render(
      <CategoriasProdutosContent
        idioma="pt"
        dados={{ rows: [ROW], total: 1 }}
        buscaInicial=""
        situacaoInicial="todos"
        page={1}
      />,
    )
  })
}

describe('CategoriasProdutosContent — router.refresh() após mutação (regressão A3)', () => {
  it('renomear categoria chama router.refresh() para invalidar o Router Cache', async () => {
    atualizarCategoriaProdutoMock.mockResolvedValue({ success: true, data: null })
    renderContent()

    const editar = container.querySelector('button[aria-label="Editar categoria"]') as HTMLButtonElement
    await act(async () => {
      editar.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const input = container.querySelector('#cat-edit') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(
      globalThis.HTMLInputElement.prototype,
      'value',
    )!.set!
    await act(async () => {
      setter.call(input, 'Eletroportáteis')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // O bloco de edição é `<Field>` (label + input) + `<div>` com os botões
    // Check (confirmar) / X (cancelar), ambos irmãos dentro da mesma linha flex.
    const editRow = input.closest('.sm\\:items-end') as HTMLElement
    const confirmBtn = editRow.querySelectorAll('button')[0] as HTMLButtonElement

    await act(async () => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(atualizarCategoriaProdutoMock).toHaveBeenCalledWith({
      id: ROW.id,
      nome: 'Eletroportáteis',
    })
    expect(routerRefreshMock).toHaveBeenCalled()
  })

  it('ativar/inativar categoria chama router.refresh() para invalidar o Router Cache', async () => {
    alternarAtivoCategoriaProdutoMock.mockResolvedValue({ success: true, data: null })
    renderContent()

    const toggle = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Inativar' || b.textContent === 'Ativar',
    ) as HTMLButtonElement

    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(alternarAtivoCategoriaProdutoMock).toHaveBeenCalledWith(ROW.id, false)
    expect(routerRefreshMock).toHaveBeenCalled()
  })
})
