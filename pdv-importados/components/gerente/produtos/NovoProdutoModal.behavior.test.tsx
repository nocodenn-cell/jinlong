/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import {
  expectFluxoAtacadoAberto,
  preencherESalvarProdutoDemo,
} from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

const criarProdutoMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: (...args: unknown[]) => criarProdutoMock(...args),
}))

vi.mock('@/components/gerente/produtos/produtoFormSections/FaixasAtacadoEditor', () => ({
  FaixasAtacadoEditor: ({ produtoId }: { produtoId: string }) =>
    React.createElement('div', { 'data-testid': 'faixas-editor', 'data-produto-id': produtoId }),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'

const m = getMessages('pt')
const opcoes = { categorias: [], marcas: [], fornecedores: [] }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  criarProdutoMock.mockReset()
  criarProdutoMock.mockResolvedValue({ success: true, data: { id: 'produto-uuid-1' } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function render(ui: React.ReactElement) {
  flushSync(() => root.render(ui))
}

describe('NovoProdutoModal — fluxo cadastro + atacado', () => {
  it('após salvar permanece aberto e exibe editor de faixas na aba venda', async () => {
    const onCriado = vi.fn()
    render(
      <NovoProdutoModal
        open
        onOpenChange={vi.fn()}
        m={m}
        opcoes={opcoes}
        onCriado={onCriado}
      />,
    )

    await preencherESalvarProdutoDemo(container, m, criarProdutoMock)

    expect(onCriado).toHaveBeenCalled()
    expectFluxoAtacadoAberto(container, m)
    expect(container.querySelector('[data-testid="faixas-editor"]')?.getAttribute('data-produto-id')).toBe(
      'produto-uuid-1',
    )
  })
})
