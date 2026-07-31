/** @vitest-environment jsdom */
/**
 * P0 do cadastro: no modo SIMPLES (padrão da criação), o operador precisa ver
 * custo, margem e fornecedor sem abrir "Mais detalhes". Custo escondido virava
 * produto sem custo (prejuízo silencioso); fornecedor escondido virava compra
 * sem rastreabilidade.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { setInputValue } from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: vi.fn().mockResolvedValue({ success: true, data: { id: 'p-1' } }),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('@/app/gerente/produtos/sugestaoCadastroActions', () => ({
  sugerirDadosCadastroPorGtin: vi.fn().mockResolvedValue({ ok: false, error: 'skip' }),
  registrarCadastroProdutoTelemetry: vi.fn().mockResolvedValue({ ok: true }),
}))

import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'

const m = getMessages('pt')
const p = m.produtos
const opcoes = {
  categorias: [{ id: 'cat-1', nome: 'Bebidas' }],
  marcas: [],
  fornecedores: [{ id: 'forn-1', nome: 'Importadora Shenzhen' }],
}

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

function renderSimples() {
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

function campo(field: string): HTMLInputElement | null {
  return container.querySelector(`input[data-field="${field}"]`)
}

function caixaMargem(): HTMLElement {
  const el = container.querySelector('[data-field="margem"]') as HTMLElement | null
  expect(el, 'caixa de margem').toBeTruthy()
  return el!
}

/** O modo simples é o padrão: "Mais detalhes" ainda não foi clicado. */
function expectModoSimples() {
  expect(container.textContent).toContain(p.modo_completo)
}

describe('cadastro simples — custo e margem visíveis', () => {
  it('mostra o campo de custo sem abrir Mais detalhes', () => {
    renderSimples()
    expectModoSimples()
    expect(campo('preco_custo')).toBeTruthy()
    expect(container.textContent).toContain(p.preco_custo)
  })

  it('mostra a margem já no modo simples', () => {
    renderSimples()
    expectModoSimples()
    expect(container.textContent).toContain(p.margem_label)
  })

  it('pede o custo quando só o preço de venda foi informado', () => {
    renderSimples()
    setInputValue(campo('preco_varejo')!, '50,00')
    expect(caixaMargem().dataset.tom).toBe('indefinida')
    expect(container.textContent).toContain(p.margem_sem_custo)
  })

  it('alerta forte quando a venda fica abaixo do custo', () => {
    renderSimples()
    setInputValue(campo('preco_custo')!, '100,00')
    setInputValue(campo('preco_varejo')!, '80,00')

    const box = caixaMargem()
    expect(box.dataset.tom).toBe('negativa')
    expect(box.className).toContain('--color-danger-bg')
    expect(container.textContent).toContain(p.margem_alerta_negativa)
  })

  it('alerta quando a venda empata com o custo', () => {
    renderSimples()
    setInputValue(campo('preco_custo')!, '30,00')
    setInputValue(campo('preco_varejo')!, '30,00')

    const box = caixaMargem()
    expect(box.dataset.tom).toBe('zero')
    expect(box.className).toContain('--color-warning-bg')
    expect(container.textContent).toContain(p.margem_alerta_zero)
  })

  it('não alerta em margem saudável', () => {
    renderSimples()
    setInputValue(campo('preco_custo')!, '40,00')
    setInputValue(campo('preco_varejo')!, '100,00')

    const box = caixaMargem()
    expect(box.dataset.tom).toBe('ok')
    expect(container.textContent).not.toContain(p.margem_alerta_negativa)
    expect(container.textContent).not.toContain(p.margem_alerta_zero)
    expect(box.textContent).toContain('60,0%')
  })
})

describe('cadastro simples — fornecedor visível', () => {
  it('mostra o fornecedor sem abrir Mais detalhes', () => {
    renderSimples()
    expectModoSimples()
    expect(container.textContent).toContain(p.fornecedor_principal_label)
  })

  it('permite escolher um fornecedor existente no modo simples', () => {
    renderSimples()
    const opcao = Array.from(container.querySelectorAll('option')).find(
      (o) => o.textContent === 'Importadora Shenzhen',
    )
    expect(opcao, 'opção do fornecedor no modo simples').toBeTruthy()

    const select = opcao!.closest('select') as HTMLSelectElement
    flushSync(() => {
      select.value = 'forn-1'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(select.value).toBe('forn-1')
  })

  it('mantém um único ponto de edição do fornecedor após abrir Mais detalhes', () => {
    renderSimples()
    const maisDetalhes = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(p.modo_completo),
    )
    flushSync(() => maisDetalhes!.click())

    const rotulos = (container.textContent ?? '').split(p.fornecedor_principal_label).length - 1
    expect(rotulos, 'fornecedor não deve aparecer duplicado').toBe(1)
  })
})
