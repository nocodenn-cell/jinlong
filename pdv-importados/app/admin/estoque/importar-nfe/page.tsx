import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { ImportarNfePageClient } from '@/app/gerente/estoque/importar-nfe/ImportarNfePageClient'

export default async function AdminEstoqueImportarNfePage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.importNfe,
    resource: `route:${ROUTES.admin.importNfe}`,
  })

  return <ImportarNfePageClient idioma={session.idioma} />
}
