/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { preencherESalvarProdutoDemo } from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

const criarProdutoMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: (...args: unknown[]) => criarProdutoMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { CatalogoNovoButton } from '@/app/admin/catalogo/_components/CatalogoNovoButton'

const m = getMessages('pt')
const opcoes = { categorias: [], marcas: [], fornecedores: [] }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  criarProdutoMock.mockReset()
  criarProdutoMock.mockResolvedValue({ success: true, data: { id: 'produto-uuid-nav' } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function renderBotao() {
  flushSync(() =>
    root.render(
      <CatalogoNovoButton
        label={m.produtos.cadastro_rapido}
        labelCompleto={m.produtos.cadastro_completo}
        m={m}
        opcoes={opcoes}
        idioma="pt"
      />,
    ),
  )
}

function botaoRapido() {
  return Array.from(container.querySelectorAll('button')).find((el) =>
    el.textContent?.includes(m.produtos.cadastro_rapido),
  ) as HTMLButtonElement
}

describe('Novo produto — Cadastro rápido e Cadastro completo', () => {
  it('oferece o Cadastro completo como link para /admin/catalogo/novo/completo', () => {
    renderBotao()
    const link = Array.from(container.querySelectorAll('a')).find((el) =>
      el.textContent?.includes(m.produtos.cadastro_completo),
    ) as HTMLAnchorElement
    expect(link, 'link Cadastro completo').toBeTruthy()
    expect(link.getAttribute('href')).toBe('/admin/catalogo/novo/completo')
  })

  it('Cadastro rápido continua abrindo o modal, agora identificado como rápido', () => {
    renderBotao()
    expect(container.textContent).not.toContain(m.produtos.secao_essencial)
    flushSync(() => botaoRapido().click())
    expect(container.textContent).toContain(m.produtos.secao_essencial)
    expect(document.body.textContent).toContain(m.produtos.cadastro_rapido_produto_titulo)
    expect(document.body.textContent).toContain(m.produtos.cadastro_rapido_descricao)
  })

  it('pós-save oferece "Completar cadastro" para o produto recém-criado, sem remover as demais ações', async () => {
    renderBotao()
    flushSync(() => botaoRapido().click())
    await preencherESalvarProdutoDemo(document.body, m, criarProdutoMock)

    await vi.waitFor(() => {
      const link = Array.from(document.body.querySelectorAll('a')).find((el) =>
        el.textContent?.includes(m.produtos.pos_salvar_completar_cadastro),
      ) as HTMLAnchorElement | undefined
      expect(link, 'link Completar cadastro').toBeTruthy()
      expect(link!.getAttribute('href')).toBe('/admin/catalogo/produto-uuid-nav/completo')
    })
    expect(document.body.textContent).toContain(m.produtos.pos_salvar_ajustar_estoque)
    expect(document.body.textContent).toContain(m.produtos.pos_salvar_imprimir_etiqueta)
  })
})
