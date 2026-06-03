import { Suspense } from 'react'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { GerenteRouteLoader } from '@/components/gerente/GerenteRouteLoading'
import { RelatoriosSemGiroPageClient } from './RelatoriosSemGiroPageClient'

export default async function GerenteRelatoriosSemGiroPage() {
  const { idioma } = await getUsuarioIdioma()

  return (
    <Suspense
      fallback={<GerenteRouteLoader />}
    >
      <RelatoriosSemGiroPageClient idioma={idioma} />
    </Suspense>
  )
}
