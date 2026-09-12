import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { EstoqueHubNav } from '@/components/ui/admin-v2/EstoqueHubNav'
import { ImportarNfePageClient } from '@/app/gerente/estoque/importar-nfe/ImportarNfePageClient'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SearchParams = { id?: string }
type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminEstoqueImportarNfePage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.importNfe,
    resource: `route:${ROUTES.admin.importNfe}`,
  })

  const sp = (searchParams ? await searchParams : {}) ?? {}
  const importacaoId = sp.id && UUID_RE.test(sp.id) ? sp.id : null

  return (
    <div className="admin-v2-page">
      <EstoqueHubNav />
      <ImportarNfePageClient
        idioma={session.idioma}
        embeddedInAdminHub
        importacaoIdInicial={importacaoId}
      />
    </div>
  )
}
