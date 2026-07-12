import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { FuncionariosListClient } from '@/app/gerente/funcionarios/FuncionariosListClient'
import { listarFuncionarios } from '@/app/gerente/funcionarios/actions'

export default async function AdminFuncionariosPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.funcionarios,
    resource: `route:${ROUTES.admin.funcionarios}`,
  })

  const res = await listarFuncionarios()
  const funcionariosIniciais = res.success ? res.data : []

  return (
    <FuncionariosListClient
      idioma={session.idioma}
      funcionariosIniciais={funcionariosIniciais}
      podeCriarGerente={session.perfil === 'DONO'}
    />
  )
}
