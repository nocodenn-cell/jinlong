import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { ImprimirEtiquetasPageClient } from '@/app/gerente/estoque/imprimir-etiquetas/ImprimirEtiquetasPageClient'

type SearchParams = { codigo?: string; produto?: string }

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminImprimirEtiquetasPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoqueImprimirEtiquetas,
    resource: `route:${ROUTES.admin.estoqueImprimirEtiquetas}`,
  })
  const sp = (searchParams ? await searchParams : {}) ?? {}

  return (
    <ImprimirEtiquetasPageClient
      idioma={session.idioma}
      initialCodigo={typeof sp.codigo === 'string' ? sp.codigo : undefined}
      initialProdutoId={typeof sp.produto === 'string' ? sp.produto : undefined}
    />
  )
}
