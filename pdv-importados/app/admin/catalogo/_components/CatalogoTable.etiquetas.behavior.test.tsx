/** @vitest-environment jsdom */
/**
 * Regressão: ação "Imprimir etiqueta" deve existir na linha do catálogo
 * e apontar para a rota canônica (mesmo módulo de estoque).
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import type { CatalogoProduto } from './CatalogoTable'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/catalogo',
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

vi.mock('@/app/gerente/produtos/actions', () => ({
  publicarProduto: vi.fn(),
  inativarProduto: vi.fn(),
  reativarProduto: vi.fn(),
}))

const { CatalogoTable } = await import('./CatalogoTable')

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const m = getMessages('pt')
const ui = m.admin_ui

const produto = {
  id: 'prod-etq-1',
  nome: 'Parafuso M6',
  codigo_barras: '7891000100015',
  codigo_interno: null,
  sku: '7891000100015',
  referencia_fornecedor: null,
  nome_reduzido_pdv: null,
  localizacao_prateleira: null,
  preco_varejo: 1.5,
  preco_atacado: null,
  preco_custo: 0.5,
  preco_custo_medio: 0.5,
  estoque_minimo: 0,
  permitir_abaixo_custo: false,
  quantidade_gatilho_atacado: null,
  quantidade_atual: 10,
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
} as unknown as CatalogoProduto

describe('CatalogoTable — Imprimir etiqueta', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('expõe botão por linha com href canônico pré-selecionando o produto', () => {
    act(() => {
      root.render(
        <CatalogoTable
          produtos={[produto]}
          m={m}
          idioma="pt"
          opcoes={{ categorias: [], marcas: [], fornecedores: [] }}
          labels={{
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
            vazioTitulo: 'Vazio',
            vazioSub: '—',
            vazioFiltrosTitulo: 'Filtros',
            vazioFiltrosSub: '—',
            limparFiltros: 'Limpar',
            cadastroRapido: 'Rápido',
            origemChina: 'China',
            origemBrasilNf: 'BR NF',
            origemBrasil: 'BR',
            acaoEditar: ui.catalogo_acao_editar,
            acaoDuplicar: ui.catalogo_acao_duplicar,
            acaoImprimirEtiqueta: ui.catalogo_acao_imprimir_etiqueta,
            acaoVerEstoque: ui.catalogo_acao_ver_estoque,
            acaoSelecionarLinha: ui.catalogo_acao_selecionar_linha,
            reativar: 'Reativar',
            inativarConfirmTitulo: 'Inativar?',
            inativarConfirmTexto: 'Confirma',
            confirmar: 'Confirmar',
            cancelar: 'Cancelar',
            fechar: 'Fechar',
          }}
        />,
      )
    })

    const aria = ui.catalogo_acao_imprimir_etiqueta.replace('{{nome}}', produto.nome)
    const link = container.querySelector(`a[aria-label="${aria}"]`) as HTMLAnchorElement | null
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe(
      `/admin/estoque/imprimir-etiquetas?codigo=${produto.codigo_barras}`,
    )
  })
})
