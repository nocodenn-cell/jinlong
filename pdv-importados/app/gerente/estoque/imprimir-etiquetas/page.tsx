import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { ImprimirEtiquetasPageClient } from './ImprimirEtiquetasPageClient'

export default async function ImprimirEtiquetasPage() {
  const { idioma } = await getUsuarioIdioma()

  return <ImprimirEtiquetasPageClient idioma={idioma} />
}
