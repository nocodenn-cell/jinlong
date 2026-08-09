import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { EstoqueHubNav } from '@/components/ui/admin-v2/EstoqueHubNav'
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
    <div className="admin-v2-page">
      <EstoqueHubNav />
      <ImprimirEtiquetasPageClient
        idioma={session.idioma}
        initialCodigo={typeof sp.codigo === 'string' ? sp.codigo : undefined}
        initialProdutoId={typeof sp.produto === 'string' ? sp.produto : undefined}
        embeddedInAdminHub
      />
    </div>
  )
}
