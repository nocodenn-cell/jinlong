import { unstable_noStore as noStore } from 'next/cache'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import {
  buscarProdutosComFiltros,
  listarOpcoesFiltrosProdutos,
} from './actions'
import { DEFAULT_BUSCAR_PRODUTOS_FILTROS } from './produtoGerenteListagemDefaults'
import { ProdutosGerentePageClient } from './ProdutosGerentePageClient'

/** Lista muda com importação/cadastro — evita HTML estático em cache após `revalidatePath`. */
export const dynamic = 'force-dynamic'

export default async function ProdutosPage() {
  noStore()
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
