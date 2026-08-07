/** @vitest-environment jsdom */
/**
 * Erro de validação tem de aparecer NO campo, com foco — antes era só um toast
 * flutuante e o operador tinha que caçar qual campo estava reprovado.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { setInputValue } from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

const criarProdutoMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: (...args: unknown[]) => criarProdutoMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitToast: vi.fn(),
}))

vi.mock('@/app/gerente/produtos/sugestaoCadastroActions', () => ({
  sugerirDadosCadastroPorGtin: vi.fn().mockResolvedValue({ ok: false, error: 'skip' }),
  registrarCadastroProdutoTelemetry: vi.fn().mockResolvedValue({ ok: true }),
}))

import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'

const m = getMessages('pt')
const p = m.produtos
const opcoes = { categorias: [], marcas: [], fornecedores: [] }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  criarProdutoMock.mockReset()
  criarProdutoMock.mockResolvedValue({ success: true, data: { id: 'p-1' } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  // jsdom não implementa scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function render() {
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

function clicarSalvar() {
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(p.salvar_produto),
  ) as HTMLButtonElement
  expect(btn, 'botão Salvar produto').toBeTruthy()
  flushSync(() => btn.click())
}

describe('erro inline + foco', () => {
  it('marca o nome e leva o foco quando está vazio', () => {
    render()
    clicarSalvar()

    const nome = campo('nome')!
    expect(nome.getAttribute('aria-invalid')).toBe('true')
    expect(container.textContent).toContain(p.nome_obrigatorio)
    expect(document.activeElement).toBe(nome)
    expect(criarProdutoMock).not.toHaveBeenCalled()
  })

  it('rola até o campo reprovado', () => {
    render()
    clicarSalvar()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('marca o preço de venda quando o nome já está válido', () => {
    render()
    setInputValue(campo('nome')!, 'Caneca Térmica')
    clicarSalvar()

    const varejo = campo('preco_varejo')!
    expect(varejo.getAttribute('aria-invalid')).toBe('true')
    expect(container.textContent).toContain(p.preco_invalido)
    expect(document.activeElement).toBe(varejo)
  })

  it('limpa a marcação assim que o operador corrige o campo', async () => {
    render()
    clicarSalvar()
    expect(campo('nome')!.getAttribute('aria-invalid')).toBe('true')

    flushSync(() => setInputValue(campo('nome')!, 'Caneca Térmica'))
    // A limpeza roda em efeito passivo — imperceptível no browser, assíncrona no teste.
    await vi.waitFor(() => {
      expect(campo('nome')!.getAttribute('aria-invalid')).toBeNull()
    })
    expect(container.textContent).not.toContain(p.nome_obrigatorio)
  })

  it('abre Mais detalhes quando o campo reprovado mora lá', () => {
    render()
    setInputValue(campo('nome')!, 'Caneca Térmica')
    setInputValue(campo('preco_varejo')!, '10,00')

    // Atacado só existe no modo completo: abre, preenche inválido, fecha.
    const abrir = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(p.modo_completo),
    )!
    flushSync(() => abrir.click())
    setInputValue(campo('preco_atacado')!, '20,00')

    const fechar = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(p.modo_compacto),
    )!
    flushSync(() => fechar.click())
    expect(campo('preco_atacado'), 'atacado escondido').toBeNull()

    clicarSalvar()

    // Reabriu sozinho, marcou e focou — não deixa o erro invisível.
    const atacado = campo('preco_atacado')
    expect(atacado, 'atacado remontado').toBeTruthy()
    expect(atacado!.getAttribute('aria-invalid')).toBe('true')
    expect(container.textContent).toContain(p.atacado_maior_varejo)
    expect(document.activeElement).toBe(atacado)
    expect(criarProdutoMock).not.toHaveBeenCalled()
  })
})

describe('cadeia do Enter até o estoque', () => {
  it('vai do nome ao custo, do custo ao varejo e do varejo ao estoque', () => {
    render()
    const nome = campo('nome')!
    const custo = campo('preco_custo')!
    const varejo = campo('preco_varejo')!
    const estoque = campo('estoque_inicial')!

    nome.focus()
    nome.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(document.activeElement).toBe(custo)

    custo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(document.activeElement).toBe(varejo)

    varejo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(document.activeElement).toBe(estoque)
  })

  it('Enter no estoque inicial salva', async () => {
    render()
    setInputValue(campo('nome')!, 'Caneca Térmica')
    setInputValue(campo('preco_varejo')!, '10,00')
    setInputValue(campo('estoque_inicial')!, '12')

    const estoque = campo('estoque_inicial')!
    flushSync(() => {
      estoque.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    await vi.waitFor(() => expect(criarProdutoMock).toHaveBeenCalled())
    const payload = criarProdutoMock.mock.calls[0][0] as {
      estoque_inicial_quantidade?: number
      nome?: string
    }
    expect(payload.nome).toBe('Caneca Térmica')
    expect(payload.estoque_inicial_quantidade).toBe(12)
  })
})

describe('unidade no estoque inicial', () => {
  it('mostra a unidade escolhida junto da quantidade', () => {
    render()
    const select = container.querySelector(
      'select[data-field="unidade_medida"]',
    ) as HTMLSelectElement
    flushSync(() => {
      select.value = 'CX'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const label = campo('estoque_inicial')!.closest('label')!
    expect(label.textContent).toContain(p.estoque_inicial_label)
    expect(label.textContent).toContain('(CX)')
  })
})
