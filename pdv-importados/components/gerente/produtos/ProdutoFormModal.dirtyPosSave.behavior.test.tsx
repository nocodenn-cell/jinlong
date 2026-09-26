/** @vitest-environment jsdom */
/**
 * Contrato dirty pós-save do Cadastro de Produto.
 *
 * Casos: editar→descartar; save→sem descartar; save+editar→descartar;
 * save falha→descartar; create→baseline; refresh opções não destrói posSalvar.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { setInputValue } from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

const criarProdutoMock = vi.fn()
const toastMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: (...args: unknown[]) => criarProdutoMock(...args),
  atualizarDadosProdutoGerente: vi.fn(),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: (...args: unknown[]) => toastMock(...args),
}))

vi.mock('@/app/gerente/produtos/sugestaoCadastroActions', () => ({
  sugerirDadosCadastroPorGtin: vi.fn().mockResolvedValue({ ok: false, error: 'skip' }),
  registrarCadastroProdutoTelemetry: vi.fn().mockResolvedValue({ ok: true }),
}))

import { ProdutoFormModal } from '@/components/gerente/produtos/ProdutoFormModal'

const m = getMessages('pt')
const p = m.produtos
const opcoesBase = {
  categorias: [{ id: 'cat-1', nome: 'Temperos' }],
  marcas: [],
  fornecedores: [{ id: 'forn-1', nome: 'Fornecedor A' }],
}

let container: HTMLDivElement
let root: Root
let onOpenChange: ReturnType<typeof vi.fn>
let onSaved: ReturnType<typeof vi.fn>

beforeEach(() => {
  criarProdutoMock.mockReset()
  toastMock.mockReset()
  onOpenChange = vi.fn()
  onSaved = vi.fn()
  criarProdutoMock.mockResolvedValue({ success: true, data: { id: 'prod-canela' } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function renderModal(opcoes = opcoesBase) {
  flushSync(() =>
    root.render(
      <ProdutoFormModal
        open
        onOpenChange={onOpenChange}
        m={m}
        opcoes={opcoes}
        onSaved={onSaved}
      />,
    ),
  )
}

function campo(field: string): HTMLInputElement {
  const el = container.querySelector(`input[data-field="${field}"]`) as HTMLInputElement | null
  expect(el, `campo ${field}`).toBeTruthy()
  return el!
}

function botaoPorTexto(texto: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(texto),
  ) as HTMLButtonElement | undefined
  expect(btn, `botão ${texto}`).toBeTruthy()
  return btn!
}

function preencherMinimo() {
  setInputValue(campo('nome'), 'canela em pó')
  setInputValue(campo('preco_varejo'), '12,50')
}

function temConfirmDescartar(): boolean {
  return (container.textContent ?? '').includes(p.confirm_descartar_titulo)
}

async function salvarSucesso() {
  preencherMinimo()
  flushSync(() => botaoPorTexto(p.salvar_produto).click())
  await vi.waitFor(() => expect(criarProdutoMock).toHaveBeenCalled())
  await vi.waitFor(() => {
    expect(container.textContent).toContain(p.pos_salvar_titulo_publicado)
  })
}

describe('ProdutoFormModal — dirty pós-save', () => {
  it('caso 1: editar sem salvar → close abre confirmação de descarte', () => {
    renderModal()
    preencherMinimo()
    flushSync(() => botaoPorTexto(m.comum.cancelar).click())
    expect(temConfirmDescartar()).toBe(true)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('caso 2: save sucesso → close NÃO abre confirmação', async () => {
    renderModal()
    await salvarSucesso()
    expect(temConfirmDescartar()).toBe(false)
    flushSync(() => botaoPorTexto(m.comum.fechar).click())
    expect(temConfirmDescartar()).toBe(false)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('caso 3: save sucesso → alterar novamente → close abre confirmação', async () => {
    // "Salvar e continuar" mantém o form aberto (sem posSalvar) com baseline limpo.
    renderModal()
    preencherMinimo()
    flushSync(() => botaoPorTexto(p.salvar_e_novo).click())
    await vi.waitFor(() => expect(criarProdutoMock).toHaveBeenCalled())
    await vi.waitFor(() => expect(campo('nome').value).toBe(''))
    expect(temConfirmDescartar()).toBe(false)
    // Foco volta pro código de barras entre um item e o próximo — sem isso o
    // operador perde o ritmo do cadastro em volume via scanner.
    await vi.waitFor(() => expect(document.activeElement).toBe(campo('codigo_barras')))

    setInputValue(campo('nome'), 'próximo item sujo')
    flushSync(() => botaoPorTexto(m.comum.cancelar).click())
    expect(temConfirmDescartar()).toBe(true)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('caso 4: save falha → close abre confirmação (dirty permanece)', async () => {
    criarProdutoMock.mockResolvedValue({ success: false, error: 'Falha simulada' })
    renderModal()
    preencherMinimo()
    flushSync(() => botaoPorTexto(p.salvar_produto).click())
    await vi.waitFor(() => expect(criarProdutoMock).toHaveBeenCalled())
    await vi.waitFor(() => {
      expect(botaoPorTexto(m.comum.cancelar).disabled).toBe(false)
    })
    expect(container.textContent).not.toContain(p.pos_salvar_titulo_publicado)
    flushSync(() => botaoPorTexto(m.comum.cancelar).click())
    expect(temConfirmDescartar()).toBe(true)
  })

  it('caso 5: create sucesso → baseline limpo (fechar pós-save sem descarte)', async () => {
    renderModal()
    await salvarSucesso()
    expect(onSaved).toHaveBeenCalled()
    flushSync(() => botaoPorTexto(m.comum.fechar).click())
    expect(temConfirmDescartar()).toBe(false)
  })

  it('caso 6: mudança de opcoesIniciais após save não destrói posSalvar nem reativa dirty', async () => {
    renderModal()
    await salvarSucesso()
    const opcoesRefresh = {
      categorias: [{ id: 'cat-1', nome: 'Temperos' }, { id: 'cat-x', nome: 'Extra' }],
      marcas: [{ id: 'm-1', nome: 'Marca X' }],
      fornecedores: opcoesBase.fornecedores,
    }
    flushSync(() =>
      root.render(
        <ProdutoFormModal
          open
          onOpenChange={onOpenChange}
          m={m}
          opcoes={opcoesRefresh}
          onSaved={onSaved}
        />,
      ),
    )
    expect(container.textContent).toContain(p.pos_salvar_titulo_publicado)
    expect(temConfirmDescartar()).toBe(false)
    flushSync(() => botaoPorTexto(m.comum.fechar).click())
    expect(temConfirmDescartar()).toBe(false)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('Salvar e continuar: limpa item, preserva contexto e não abre descarte ao cancelar em branco', async () => {
    renderModal()
    preencherMinimo()
    flushSync(() => botaoPorTexto(p.salvar_e_novo).click())
    await vi.waitFor(() => expect(criarProdutoMock).toHaveBeenCalled())
    await vi.waitFor(() => expect(campo('nome').value).toBe(''))
    expect(container.textContent).not.toContain(p.pos_salvar_titulo_publicado)
    flushSync(() => botaoPorTexto(m.comum.cancelar).click())
    expect(temConfirmDescartar()).toBe(false)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
