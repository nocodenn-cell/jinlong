/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { setInputValue } from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

const criarProdutoMock = vi.fn()
const atualizarEstoqueMock = vi.fn()
const emitirToastMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: (...args: unknown[]) => criarProdutoMock(...args),
  atualizarDadosProdutoGerente: vi.fn(),
}))

vi.mock('@/app/gerente/estoque/actions', () => ({
  atualizarEstoqueProduto: (...args: unknown[]) => atualizarEstoqueMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: (...args: unknown[]) => emitirToastMock(...args),
}))

vi.mock('@/app/gerente/produtos/sugestaoCadastroActions', () => ({
  sugerirDadosCadastroPorGtin: vi.fn().mockResolvedValue({ ok: false, error: 'skip' }),
  registrarCadastroProdutoTelemetry: vi.fn().mockResolvedValue({ ok: true }),
}))

import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'

const m = getMessages('pt')
const opcoes = { categorias: [], marcas: [], fornecedores: [] }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  criarProdutoMock.mockReset()
  atualizarEstoqueMock.mockReset()
  emitirToastMock.mockReset()
  criarProdutoMock.mockResolvedValue({ success: true, data: { id: 'produto-uuid-estoque' } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function renderModal() {
  flushSync(() =>
    root.render(
      <NovoProdutoModal
        open
        onOpenChange={vi.fn()}
        m={m}
        opcoes={opcoes}
        onCriado={vi.fn()}
      />,
    ),
  )
}

function preencherNomePrecoEstoque(qty: string) {
  const nome = container.querySelector('input[data-field="nome"]') as HTMLInputElement
  setInputValue(nome, 'Produto Estoque Teste')

  const precoVarejo = container.querySelector(
    'input[data-field="preco_varejo"]',
  ) as HTMLInputElement
  setInputValue(precoVarejo, '12,50')

  const labelEstoque = Array.from(container.querySelectorAll('label')).find((l) =>
    (l.textContent ?? '').includes(m.produtos.estoque_inicial_label),
  )
  expect(labelEstoque, 'label estoque inicial').toBeTruthy()
  const qtyInput = labelEstoque!.querySelector('input[inputmode="numeric"]') as HTMLInputElement
  setInputValue(qtyInput, qty)
}

async function clicarSalvar() {
  const salvar = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(m.produtos.salvar_produto),
  ) as HTMLButtonElement
  expect(salvar, 'botão Salvar principal').toBeTruthy()
  flushSync(() => {
    salvar.click()
  })
  await vi.waitFor(() => expect(criarProdutoMock).toHaveBeenCalled())
}

describe('ProdutoFormModal — estoque inicial atômico (RPC)', () => {
  it('envia estoque + request_id no create e não chama ajustar separado', async () => {
    renderModal()
    preencherNomePrecoEstoque('15')
    await clicarSalvar()

    const payload = criarProdutoMock.mock.calls[0]?.[0] as {
      estoque_inicial_quantidade: number
      estoque_inicial_minimo: number
      client_request_id: string | null
    }
    expect(payload.estoque_inicial_quantidade).toBe(15)
    expect(payload.client_request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(atualizarEstoqueMock).not.toHaveBeenCalled()

    await vi.waitFor(() => {
      const success = emitirToastMock.mock.calls.find(
        (c) => (c[0] as { kind: string }).kind === 'success',
      )
      expect(success?.[0]).toMatchObject({
        kind: 'success',
        message: m.produtos.criado_publicado,
      })
    })
  })

  it('falha no create (TX): toast de erro e sem sucesso pleno', async () => {
    criarProdutoMock.mockResolvedValue({
      success: false,
      error: 'Código de barras já cadastrado nesta loja. Busque o produto existente no catálogo.',
    })
    renderModal()
    preencherNomePrecoEstoque('8')
    await clicarSalvar()

    await vi.waitFor(() => {
      const err = emitirToastMock.mock.calls.find(
        (c) => (c[0] as { kind: string }).kind === 'error',
      )
      expect(err?.[0]).toMatchObject({ kind: 'error' })
    })
    const successCriado = emitirToastMock.mock.calls.find(
      (c) =>
        (c[0] as { kind: string; message: string }).kind === 'success' &&
        (c[0] as { message: string }).message === m.produtos.criado_publicado,
    )
    expect(successCriado).toBeUndefined()
    expect(atualizarEstoqueMock).not.toHaveBeenCalled()
  })

  it('sem estoque pedido: create com qty 0 e sem ajustar separado', async () => {
    renderModal()
    const nome = container.querySelector('input[data-field="nome"]') as HTMLInputElement
    setInputValue(nome, 'Sem Estoque Inicial')
    const precoVarejo = container.querySelector(
      'input[data-field="preco_varejo"]',
    ) as HTMLInputElement
    setInputValue(precoVarejo, '5,00')
    await clicarSalvar()

    const payload = criarProdutoMock.mock.calls[0]?.[0] as {
      estoque_inicial_quantidade: number
    }
    expect(payload.estoque_inicial_quantidade).toBe(0)
    expect(atualizarEstoqueMock).not.toHaveBeenCalled()
  })
})
