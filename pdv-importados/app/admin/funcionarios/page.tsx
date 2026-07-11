import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { listarFuncionariosPaginadoAction } from '@/app/gerente/funcionarios/actions'
import { FuncionariosListClient } from '@/app/gerente/funcionarios/FuncionariosListClient'

export default async function AdminFuncionariosPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.funcionarios,
    resource: `route:${ROUTES.admin.funcionarios}`,
  })

  const resultado = await listarFuncionariosPaginadoAction(1)
  const funcionariosIniciais = resultado.ok ? resultado.funcionarios : []
  const hasMoreInicial = resultado.ok ? resultado.hasMore : false

  return (
    <FuncionariosListClient
      idioma={session.idioma}
      funcionariosIniciais={funcionariosIniciais}
      hasMoreInicial={hasMoreInicial}
    />
  )
}
