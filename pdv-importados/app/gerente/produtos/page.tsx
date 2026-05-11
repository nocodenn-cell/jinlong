import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import {
  buscarProdutosComFiltros,
  listarOpcoesFiltrosProdutos,
} from './actions'
import { DEFAULT_BUSCAR_PRODUTOS_FILTROS } from './produtoGerenteListagemDefaults'
import { ProdutosGerentePageClient } from './ProdutosGerentePageClient'

export default async function ProdutosPage() {
  const { idioma } = await getUsuarioIdioma()
  const [opRes, listRes] = await Promise.all([
    listarOpcoesFiltrosProdutos(),
    buscarProdutosComFiltros(DEFAULT_BUSCAR_PRODUTOS_FILTROS),
  ])

  const opcoes = opRes.success
    ? opRes.data
    : { categorias: [], marcas: [], fornecedores: [] }

  const inicial = listRes.success ? listRes.data : { rows: [], total: 0 }

  return <ProdutosGerentePageClient idioma={idioma} opcoes={opcoes} inicial={inicial} />
}
