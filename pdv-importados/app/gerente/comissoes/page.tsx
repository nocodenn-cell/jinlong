import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { ComissoesPageClient } from './ComissoesPageClient'

export const revalidate = 0

export default async function ComissoesPage() {
  const { idioma } = await getUsuarioIdioma()
  return <ComissoesPageClient idioma={idioma} />
}
