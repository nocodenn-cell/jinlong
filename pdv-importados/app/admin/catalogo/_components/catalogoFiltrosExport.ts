import type { BuscarProdutosComFiltrosInput } from '@/app/gerente/produtos/actions'

export type CatalogoExportFiltros = Readonly<{
  situacao: 'todos' | 'ativos' | 'inativos'
  origem: 'all' | 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'
  estoque: 'todos' | 'abaixo_minimo' | 'em_falta'
  imagens: 'todos' | 'com_imagem' | 'sem_imagem'
  categoriaId?: string
  marcaId?: string
  fornecedorId?: string
  busca: string
}>

const EXPORT_PAGE_SIZE = 500

/** Mesmos filtros da listagem admin → input da RPC de exportação. */
export function toCatalogoExportInput(filtros: CatalogoExportFiltros): BuscarProdutosComFiltrosInput {
  return {
    situacao: filtros.situacao,
    origem: filtros.origem,
    nf: 'all',
    estoque: filtros.estoque,
    imagens: filtros.imagens,
    tags: [],
    categoriaId: filtros.categoriaId,
    marcaId: filtros.marcaId,
    fornecedorId: filtros.fornecedorId,
    busca: filtros.busca,
    page: 1,
    pageSize: EXPORT_PAGE_SIZE,
  }
}
