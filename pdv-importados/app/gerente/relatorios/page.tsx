import { Suspense } from 'react'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { GerenteListPageRouteSkeleton } from '@/components/gerente/GerenteRouteLoading'
import { RelatoriosGerentePageClient } from './RelatoriosGerentePageClient'

export default async function GerenteRelatoriosPage() {
  const { idioma } = await getUsuarioIdioma()

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
          <GerenteListPageRouteSkeleton cols={[80, 96, 160, 112, 96, 112, 80]} rows={8} />
        </div>
      }
    >
      <RelatoriosGerentePageClient idioma={idioma} />
    </Suspense>
  )
}
