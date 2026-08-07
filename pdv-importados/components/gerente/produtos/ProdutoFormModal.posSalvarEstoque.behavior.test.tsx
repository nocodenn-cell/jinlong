/** @vitest-environment jsdom */
/**
 * A tela pós-salvar não pode chamar o estoque de "passo opcional".
 *
 * Regra real do backend: `finalizar_venda_v4` chama `decrementar_estoque_seguro`
 * e aborta a venda inteira com ESTOQUE_INSUFICIENTE quando o saldo não cobre a
 * quantidade. Não existe venda com estoque negativo neste sistema. Logo, um
 * produto publicado com saldo 0 NÃO vende — dizer "liberado no PDV" ou
 * "próximos passos opcionais" manda o operador embora achando que vendeu.
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
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitToast: (...args: unknown[]) => toastMock(...args),
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
  toastMock.mockReset()
  criarProdutoMock.mockResolvedValue({ success: true, data: { id: 'p-1' } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function campo(field: string): HTMLInputElement {
  return container.querySelector(`input[data-field="${field}"]`) as HTMLInputElement
}

async function cadastrar(opts: { estoque: string }) {
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
  setInputValue(campo('nome'), 'Caneca Térmica')
  setInputValue(campo('preco_varejo'), '25,00')
  if (opts.estoque) setInputValue(campo('estoque_inicial'), opts.estoque)

  const salvar = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(p.salvar_produto),
  ) as HTMLButtonElement
  flushSync(() => salvar.click())
  await vi.waitFor(() => expect(criarProdutoMock).toHaveBeenCalled())
  await vi.waitFor(() => {
    expect(container.textContent).toContain(p.pos_salvar_ajustar_estoque)
  })
}

function mensagensToast(): string[] {
  return toastMock.mock.calls.map((c) => String((c[0] as { message?: string })?.message ?? ''))
}

describe('pós-salvar com estoque zero', () => {
  it('não promete que o produto está liberado no PDV', async () => {
    await cadastrar({ estoque: '' })
    expect(mensagensToast()).toContain(p.criado_publicado_sem_estoque)
    expect(mensagensToast()).not.toContain(p.criado_publicado)
  })

  it('não chama o ajuste de estoque de passo opcional', async () => {
    await cadastrar({ estoque: '' })
    expect(container.textContent).toContain(p.pos_salvar_hint_estoque_obrigatorio)
    expect(container.textContent).not.toContain(p.pos_salvar_hint)
  })

  it('avisa que o saldo está zerado', async () => {
    await cadastrar({ estoque: '' })
    expect(container.textContent).toContain(p.aviso_estoque_zero_publicado)
  })
})

describe('pós-salvar com estoque informado', () => {
  it('confirma que o produto está liberado no PDV', async () => {
    await cadastrar({ estoque: '10' })
    expect(mensagensToast()).toContain(p.criado_publicado)
    expect(mensagensToast()).not.toContain(p.criado_publicado_sem_estoque)
  })

  it('volta a tratar os próximos passos como opcionais', async () => {
    await cadastrar({ estoque: '10' })
    expect(container.textContent).toContain(p.pos_salvar_hint)
    expect(container.textContent).not.toContain(p.pos_salvar_hint_estoque_obrigatorio)
    expect(container.textContent).not.toContain(p.aviso_estoque_zero_publicado)
  })
})
