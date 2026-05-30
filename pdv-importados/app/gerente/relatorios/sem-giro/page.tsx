import { Suspense } from 'react'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { GerenteListPageRouteSkeleton } from '@/components/gerente/GerenteRouteLoading'
import { RelatoriosSemGiroPageClient } from './RelatoriosSemGiroPageClient'

export default async function GerenteRelatoriosSemGiroPage() {
  const { idioma } = await getUsuarioIdioma()

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
          <GerenteListPageRouteSkeleton cols={[128, 200, 96, 112, 128, 160]} rows={8} />
        </div>
      }
    >
      <RelatoriosSemGiroPageClient idioma={idioma} />
    </Suspense>
  )
}
