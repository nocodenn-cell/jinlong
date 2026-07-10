import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { buscarFornecedoresPaginadosAction } from '@/app/gerente/fornecedores/actions'
import { FornecedoresListClient } from '@/app/gerente/fornecedores/FornecedoresListClient'

export default async function AdminFornecedoresPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.fornecedores,
    resource: `route:${ROUTES.admin.fornecedores}`,
  })

  const resultado = await buscarFornecedoresPaginadosAction(1)
  const fornecedoresIniciais = resultado.ok ? resultado.fornecedores : []
  const hasMoreInicial = resultado.ok ? resultado.hasMore : false

  return (
    <FornecedoresListClient
      idioma={session.idioma}
      fornecedoresIniciais={fornecedoresIniciais}
      hasMoreInicial={hasMoreInicial}
    />
  )
}
