import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { FuncionariosPageClient } from '@/app/gerente/funcionarios/FuncionariosPageClient'

export default async function AdminFuncionariosPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.funcionarios,
    resource: `route:${ROUTES.admin.funcionarios}`,
  })

  return <FuncionariosPageClient idioma={session.idioma} />
}
