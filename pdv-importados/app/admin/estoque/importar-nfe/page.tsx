import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { EstoqueHubNav } from '@/components/ui/admin-v2/EstoqueHubNav'
import { ImportarNfePageClient } from '@/app/gerente/estoque/importar-nfe/ImportarNfePageClient'

export default async function AdminEstoqueImportarNfePage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.importNfe,
    resource: `route:${ROUTES.admin.importNfe}`,
  })

  return (
    <div className="admin-v2-page">
      <EstoqueHubNav />
      <ImportarNfePageClient idioma={session.idioma} embeddedInAdminHub />
    </div>
  )
}
