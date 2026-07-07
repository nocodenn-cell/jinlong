/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import {
  expectFluxoAtacadoAberto,
  preencherESalvarProdutoDemo,
} from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

const criarProdutoMock = vi.fn()
const routerRefreshMock = vi.fn()
const routerPushMock = vi.fn()

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock, push: routerPushMock }),
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
import { NovoProdutoClientPage } from '@/app/admin/catalogo/novo/NovoProdutoClientPage'

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
  cadastroRapido: m.produtos.cadastro_rapido,
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

describe('Cadastro produto — entradas alinhadas ao CatalogoNovoButton', () => {
  it('entrada header (CatalogoNovoButton): salvar mantém modal aberto na aba atacado', async () => {
    render(<CatalogoNovoButton label={m.produtos.cadastro_rapido} m={m} opcoes={opcoes} />)

    const abrir = Array.from(container.querySelectorAll('button')).find((el) =>
      el.textContent?.includes(m.produtos.cadastro_rapido),
    ) as HTMLButtonElement
    flushSync(() => abrir.click())

    await preencherESalvarProdutoDemo(container, m, criarProdutoMock)
    expectFluxoAtacadoAberto(container, m)
    expect(routerRefreshMock).toHaveBeenCalled()
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('entrada empty state (CatalogoTable): salvar mantém modal aberto na aba atacado', async () => {
    render(<CatalogoTable produtos={[]} labels={labels} m={m} opcoes={opcoes} />)

    const abrir = Array.from(container.querySelectorAll('button')).find((el) =>
      el.textContent?.includes(m.produtos.cadastro_rapido),
    ) as HTMLButtonElement
    flushSync(() => abrir.click())

    await preencherESalvarProdutoDemo(container, m, criarProdutoMock)
    expectFluxoAtacadoAberto(container, m)
    expect(routerRefreshMock).toHaveBeenCalled()
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('entrada /novo (NovoProdutoClientPage): salvar mantém fluxo até Concluir', async () => {
    render(<NovoProdutoClientPage m={m} opcoes={opcoes} />)

    await preencherESalvarProdutoDemo(container, m, criarProdutoMock)
    expectFluxoAtacadoAberto(container, m)
    expect(routerRefreshMock).toHaveBeenCalled()
    expect(routerPushMock).not.toHaveBeenCalled()

    const concluir = Array.from(container.querySelectorAll('button')).find((el) =>
      el.textContent?.includes(m.comum.concluir),
    ) as HTMLButtonElement
    flushSync(() => concluir.click())

    expect(routerPushMock).toHaveBeenCalledWith('/admin/catalogo')
  })
})
