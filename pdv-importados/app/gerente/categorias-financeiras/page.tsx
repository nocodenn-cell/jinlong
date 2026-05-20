import { unstable_noStore as noStore } from 'next/cache'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { CategoriasFinanceirasPageClient } from './CategoriasFinanceirasPageClient'
import { listarCategoriasFinanceiras } from './actions'

export const dynamic = 'force-dynamic'

export default async function CategoriasFinanceirasPage() {
  noStore()
  const { idioma } = await getUsuarioIdioma()
  const res = await listarCategoriasFinanceiras({
    tipo: 'todos',
    situacao: 'ativos',
    busca: '',
    page: 1,
    pageSize: 50,
  })
  const inicial = res.success ? res.data : { rows: [], total: 0 }
  return <CategoriasFinanceirasPageClient idioma={idioma} inicial={inicial} />
}
