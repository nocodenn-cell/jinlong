import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { getMessages } from '@/i18n/getMessages'
import { ImportarNfePageClient } from '@/app/gerente/estoque/importar-nfe/ImportarNfePageClient'
import { EstoqueModuleNav } from '../_components/EstoqueModuleNav'
import { estoqueNavLabelsFromUi } from '../_components/estoqueNavLabels'

export default async function AdminEstoqueImportarNfePage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.importNfe,
    resource: `route:${ROUTES.admin.importNfe}`,
  })
  const ui = getMessages(session.idioma).admin_ui

  return (
    <ImportarNfePageClient
      idioma={session.idioma}
      moduleNav={<EstoqueModuleNav active="importar-nfe" labels={estoqueNavLabelsFromUi(ui)} />}
    />
  )
}
