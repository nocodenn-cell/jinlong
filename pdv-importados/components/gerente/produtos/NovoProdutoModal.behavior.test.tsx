/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

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

function setInputValue(el: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  nativeSetter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
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

    const nome = container.querySelector('#nome-produto, input') as HTMLInputElement
    setInputValue(nome, 'Produto Demo')

    const vendaTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
      el.textContent?.includes(m.produtos.aba_venda_atacado),
    ) as HTMLButtonElement
    flushSync(() => vendaTab.click())

    const precoInput = container.querySelector('input[inputmode="decimal"]') as HTMLInputElement | null
    expect(precoInput).not.toBeNull()
    setInputValue(precoInput as HTMLInputElement, '10,00')

    const salvar = Array.from(container.querySelectorAll('button')).find((el) =>
      el.textContent?.includes(m.comum.salvar),
    ) as HTMLButtonElement
    flushSync(() => {
      salvar.click()
    })
    await vi.waitFor(() => {
      expect(criarProdutoMock).toHaveBeenCalled()
      expect(container.querySelector('[data-testid="faixas-editor"]')).not.toBeNull()
    })

    expect(onCriado).toHaveBeenCalled()
    expect(container.querySelector('[data-testid="faixas-editor"]')?.getAttribute('data-produto-id')).toBe(
      'produto-uuid-1',
    )
    expect(
      Array.from(container.querySelectorAll('button')).some((el) => el.textContent?.includes(m.comum.concluir)),
    ).toBe(true)
  })
})
