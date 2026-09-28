/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { preencherESalvarProdutoDemo } from '@/app/admin/catalogo/_components/catalogoNovoProdutoFluxo.test-helpers'

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
  vazioFiltrosTitulo: 'Nenhum com filtros',
  vazioFiltrosSub: 'Limpe os filtros',
  limparFiltros: 'Limpar filtros',
  cadastroRapido: m.produtos.cadastro_produto,
  origemChina: 'China',
  origemBrasilNf: 'Brasil NF',
  origemBrasil: 'Brasil',
  acaoEditar: 'Editar {{nome}}',
  acaoDuplicar: 'Duplicar {{nome}}',
  acaoVerEstoque: 'Ver estoque',
  acaoSelecionarLinha: 'Selecionar {{nome}}',
  reativar: 'Reativar',
  inativarConfirmTitulo: 'Inativar produto',
  inativarConfirmTexto: 'Inativar "{{nome}}"?',
  confirmar: 'Confirmar',
  cancelar: 'Cancelar',
  fechar: 'Fechar',
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
  it('entrada header (CatalogoNovoButton): salvar fecha modal e envia produto', async () => {
    render(
      <CatalogoNovoButton label={m.produtos.cadastro_produto} m={m} opcoes={opcoes} idioma="pt" />,
    )

    const abrir = Array.from(container.querySelectorAll('button')).find((el) =>
      el.textContent?.includes(m.produtos.cadastro_produto),
    ) as HTMLButtonElement
    flushSync(() => abrir.click())
    expect(modalAberto()).toBe(true)

    await preencherESalvarProdutoDemo(container, m, criarProdutoMock)
    expect(criarProdutoMock).toHaveBeenCalled()
    await vi.waitFor(() => expect(modalAberto()).toBe(false))
    expect(routerRefreshMock).toHaveBeenCalled()
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('entrada empty state (CatalogoTable): salvar fecha modal', async () => {
    render(<CatalogoTable produtos={[]} labels={labels} m={m} opcoes={opcoes} idioma="pt" />)

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
    render(<CatalogoTable produtos={[]} labels={labels} m={m} opcoes={opcoes} idioma="pt" />)

    await vi.waitFor(() => expect(modalAberto()).toBe(true))
    // Abre via useEffect: o reset do form no mesmo commit apaga o nome se
    // o helper preencher antes. Drenar até o input existir e o reset acabar.
    await vi.waitFor(() => {
      const nome = container.querySelector('input[data-field="nome"]') as HTMLInputElement | null
      expect(nome).toBeTruthy()
      expect(nome?.value).toBe('')
    })
    await new Promise((r) => setTimeout(r, 0))
    await preencherESalvarProdutoDemo(container, m, criarProdutoMock)
    await vi.waitFor(() => expect(modalAberto()).toBe(false))
    expect(routerRefreshMock).toHaveBeenCalled()
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('Editar navega para o Cadastro Completo; Duplicar navega pré-preenchendo por query', () => {
    const produto = {
      id: 'prod-editar-1',
      sku: 'SKU-1',
      nome: 'Produto de teste',
      codigo_barras: '789',
      codigo_interno: null,
      referencia_fornecedor: null,
      nome_reduzido_pdv: null,
      localizacao_prateleira: null,
      preco_varejo: 10,
      preco_atacado: null,
      preco_custo: null,
      preco_custo_medio: 0,
      estoque_minimo: null,
      permitir_abaixo_custo: false,
      quantidade_gatilho_atacado: null,
      quantidade_atual: 3,
      origem: 'china_manual',
      tem_nf: false,
      ativo: true,
      status_publicacao: 'PUBLICADO',
      imagem_url: null,
      categoria_id: null,
      marca_id: null,
      fornecedor_id: null,
      unidade_medida: 'UN',
      observacao: null,
      tags: null,
      ncm: null,
      cfop_produto: null,
      csosn: null,
      cest: null,
      cst_pis: null,
      cst_cofins: null,
      icms_origem: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    render(<CatalogoTable produtos={[produto]} labels={labels} m={m} opcoes={opcoes} idioma="pt" />)

    const editarLink = container.querySelector(
      `a[aria-label="${labels.acaoEditar.replace('{{nome}}', produto.nome)}"]`,
    ) as HTMLAnchorElement
    expect(editarLink, 'link de editar').toBeTruthy()
    expect(editarLink.getAttribute('href')).toBe(`/admin/catalogo/${produto.id}/completo`)

    const duplicarLink = container.querySelector(
      `a[aria-label="${labels.acaoDuplicar.replace('{{nome}}', produto.nome)}"]`,
    ) as HTMLAnchorElement
    expect(duplicarLink, 'link de duplicar').toBeTruthy()
    expect(duplicarLink.getAttribute('href')).toBe(
      `/admin/catalogo/novo/completo?duplicarDe=${produto.id}`,
    )
  })
})
