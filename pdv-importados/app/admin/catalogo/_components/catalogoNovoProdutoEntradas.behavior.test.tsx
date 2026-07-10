/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import {
  expectPayloadComGatilho,
  preencherESalvarProdutoDemo,
} from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

const criarProdutoMock = vi.fn()
const routerRefreshMock = vi.fn()
const routerPushMock = vi.fn()
const { getMockSearchParams, setMockSearchParams } = vi.hoisted(() => {
  let value = ''
  return {
    getMockSearchParams: () => value,
    setMockSearchParams: (next: string) => {
      value = next
    },
  }
})

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: (...args: unknown[]) => criarProdutoMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock, push: routerPushMock }),
  useSearchParams: () => new URLSearchParams(getMockSearchParams()),
}))

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))

vi.mock('@/components/gerente/produtos/ProdutosEditarCatalogoModal', () => ({
  ProdutosEditarCatalogoModal: () => null,
}))

vi.mock('@/app/admin/catalogo/_components/CatalogoPublicacaoActions', () => ({
  CatalogoPublicacaoActions: () => null,
}))

import { CatalogoNovoButton } from '@/app/admin/catalogo/_components/CatalogoNovoButton'
import { CatalogoTable } from '@/app/admin/catalogo/_components/CatalogoTable'

const m = getMessages('pt')
const opcoes = { categorias: [], marcas: [], fornecedores: [] }

const labels = {
  produto: 'Produto',
  varejo: 'Varejo',
  atacado: 'Atacado',
  estoque: 'Estoque',
  origem: 'Origem',
  status: 'Status',
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  inativo: 'Inativo',
  publicar: 'Publicar',
  inativar: 'Inativar',
  vazioTitulo: 'Nenhum produto',
  vazioSub: 'Cadastre o primeiro',
  cadastroRapido: m.produtos.cadastro_produto,
  origemChina: 'China',
  origemBrasilNf: 'Brasil NF',
  origemBrasil: 'Brasil',
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  criarProdutoMock.mockReset()
  criarProdutoMock.mockResolvedValue({ success: true, data: { id: 'produto-uuid-entrada' } })
  routerRefreshMock.mockReset()
  routerPushMock.mockReset()
  setMockSearchParams('')
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

function modalAberto() {
  return container.textContent?.includes(m.produtos.secao_essencial) ?? false
}

describe('Cadastro produto — entradas alinhadas ao CatalogoNovoButton', () => {
  it('entrada header (CatalogoNovoButton): salvar fecha modal e envia gatilho', async () => {
    render(<CatalogoNovoButton label={m.produtos.cadastro_produto} m={m} opcoes={opcoes} />)

    const abrir = Array.from(container.querySelectorAll('button')).find((el) =>
      el.textContent?.includes(m.produtos.cadastro_produto),
    ) as HTMLButtonElement
    flushSync(() => abrir.click())
    expect(modalAberto()).toBe(true)

    await preencherESalvarProdutoDemo(container, m, criarProdutoMock)
    expectPayloadComGatilho(criarProdutoMock)
    await vi.waitFor(() => expect(modalAberto()).toBe(false))
    expect(routerRefreshMock).toHaveBeenCalled()
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('entrada empty state (CatalogoTable): salvar fecha modal', async () => {
    render(<CatalogoTable produtos={[]} labels={labels} m={m} opcoes={opcoes} />)

    const abrir = Array.from(container.querySelectorAll('button')).find((el) =>
      el.textContent?.includes(m.produtos.cadastro_produto),
    ) as HTMLButtonElement
    flushSync(() => abrir.click())

    await preencherESalvarProdutoDemo(container, m, criarProdutoMock)
    await vi.waitFor(() => expect(modalAberto()).toBe(false))
    expect(routerRefreshMock).toHaveBeenCalled()
  })

  it('entrada deep-link ?modal=novo (CatalogoTable): abre modal e salva', async () => {
    setMockSearchParams('modal=novo')
    render(<CatalogoTable produtos={[]} labels={labels} m={m} opcoes={opcoes} />)

    await vi.waitFor(() => expect(modalAberto()).toBe(true))
    await preencherESalvarProdutoDemo(container, m, criarProdutoMock)
    await vi.waitFor(() => expect(modalAberto()).toBe(false))
    expect(routerRefreshMock).toHaveBeenCalled()
    expect(routerPushMock).not.toHaveBeenCalled()
  })
})
