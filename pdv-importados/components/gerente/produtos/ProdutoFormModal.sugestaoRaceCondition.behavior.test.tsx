/** @vitest-environment jsdom */
/**
 * Regressão: a sugestão de cadastro por GTIN é assíncrona (rede). Se o
 * operador digitar o nome do produto ENQUANTO a busca ainda está em voo, a
 * resposta não pode sobrescrever o que ele já digitou quando chegar depois —
 * senão um scan seguido de digitação rápida perde o texto do operador para um
 * nome vindo de uma fonte externa (ex.: Open Food Facts), silenciosamente.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { setInputValue } from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

let resolveSugestao: (value: unknown) => void = () => {}

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: vi.fn().mockResolvedValue({ success: true, data: { id: 'p-1' } }),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('@/app/gerente/produtos/sugestaoCadastroActions', () => ({
  sugerirDadosCadastroPorGtin: vi.fn(
    () =>
      new Promise((resolve) => {
        resolveSugestao = resolve
      }),
  ),
  registrarCadastroProdutoTelemetry: vi.fn().mockResolvedValue({ ok: true }),
}))

import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'

const m = getMessages('pt')
const opcoes = { categorias: [], marcas: [], fornecedores: [] }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function campo(field: string): HTMLInputElement {
  const el = container.querySelector(`input[data-field="${field}"]`) as HTMLInputElement | null
  expect(el, `campo ${field}`).toBeTruthy()
  return el!
}

describe('cadastro rápido — sugestão de GTIN não pisa em digitação concorrente', () => {
  it('mantém o nome digitado pelo operador quando a sugestão externa resolve depois', async () => {
    flushSync(() =>
      root.render(
        <NovoProdutoModal open onOpenChange={vi.fn()} m={m} opcoes={opcoes} onCriado={vi.fn()} />,
      ),
    )

    // 1. Escaneia o código — dispara a busca de sugestão em segundo plano.
    const codigo = campo('codigo_barras')
    setInputValue(codigo, '7891234567895')
    flushSync(() => {
      codigo.dispatchEvent(new Event('blur', { bubbles: true }))
    })

    // 2. Antes da rede responder, o operador já digita o nome dele.
    setInputValue(campo('nome'), 'Nome Digitado Pelo Operador')

    // 3. Só agora a sugestão externa resolve (rede lenta).
    resolveSugestao({
      ok: true,
      data: {
        gtin: '7891234567895',
        nome: 'Nome Vindo De Fonte Externa',
        precoVarejo: null,
        precoCusto: null,
        ncm: null,
        categoriaId: null,
        categoriaNome: null,
        marca: null,
        fontes: ['openfoodfacts'],
        jaCadastrado: false,
        produtoIdExistente: null,
        knownSuggestion: false,
      },
    })

    await vi.waitFor(() => {
      expect(campo('nome').value).toBe('Nome Digitado Pelo Operador')
    })
  })
})
