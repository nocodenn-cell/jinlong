import { unstable_noStore as noStore } from 'next/cache'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { listarCategoriasProdutos } from './actions'
import { CategoriasProdutosPageClient } from './CategoriasProdutosPageClient'

export const dynamic = 'force-dynamic'

export default async function CategoriasProdutosPage() {
  noStore()
  const { idioma } = await getUsuarioIdioma()

  const res = await listarCategoriasProdutos({ situacao: 'ativos', busca: '', page: 1, pageSize: 50 })
  const inicial = res.success ? res.data : { rows: [], total: 0 }

  return <CategoriasProdutosPageClient idioma={idioma} inicial={inicial} />
}
