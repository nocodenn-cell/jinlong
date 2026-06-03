import { Suspense } from 'react'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { GerenteRouteLoader } from '@/components/gerente/GerenteRouteLoading'
import { RelatoriosGerentePageClient } from './RelatoriosGerentePageClient'

export default async function GerenteRelatoriosPage() {
  const { idioma } = await getUsuarioIdioma()

  return (
    <Suspense
      fallback={<GerenteRouteLoader />}
    >
      <RelatoriosGerentePageClient idioma={idioma} />
    </Suspense>
  )
}
