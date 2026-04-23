import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { EstoqueGerentePageClient } from './EstoqueGerentePageClient'

export default async function EstoqueGerentePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>
}) {
  const { filtro } = await searchParams
  const { idioma } = await getUsuarioIdioma()
  const modo = filtro === 'baixo' ? 'baixo' : 'todos'

  return <EstoqueGerentePageClient idioma={idioma} filtro={modo} />
}
