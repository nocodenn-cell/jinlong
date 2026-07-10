/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import {
  expectPayloadComGatilho,
  expectSecaoEssencialVisivel,
  preencherESalvarProdutoDemo,
} from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

const criarProdutoMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: (...args: unknown[]) => criarProdutoMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'

const m = getMessages('pt')
const opcoes = { categorias: [], marcas: [], fornecedores: [] }

let container: HTMLDivElement
let root: Root
let onOpenChange: ReturnType<typeof vi.fn>

beforeEach(() => {
  criarProdutoMock.mockReset()
  criarProdutoMock.mockResolvedValue({ success: true, data: { id: 'produto-uuid-1' } })
  onOpenChange = vi.fn()
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

describe('NovoProdutoModal — ProdutoForm unificado', () => {
  it('exibe seção Essencial com preço e gatilho visíveis', () => {
    render(
      <NovoProdutoModal
        open
        onOpenChange={onOpenChange}
        m={m}
        opcoes={opcoes}
        onCriado={vi.fn()}
      />,
    )

    expectSecaoEssencialVisivel(container, m)
    expect(container.textContent).toContain(m.produtos.cadastro_produto)
  })

  it('após salvar envia gatilho e fecha o modal', async () => {
    const onCriado = vi.fn()
    render(
      <NovoProdutoModal
        open
        onOpenChange={onOpenChange}
        m={m}
        opcoes={opcoes}
        onCriado={onCriado}
      />,
    )

    await preencherESalvarProdutoDemo(container, m, criarProdutoMock)

    expectPayloadComGatilho(criarProdutoMock)
    await vi.waitFor(() => expect(onCriado).toHaveBeenCalled())
    expect(container.textContent).toContain(m.produtos.pos_salvar_hint)
  })
})
