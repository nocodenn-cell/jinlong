import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { ROUTES } from '@shared-core/navigation/routes'
import { buscarClientesPaginadosAction } from '@/app/gerente/clientes/actions'
import { ClientesListClient } from '@/app/gerente/clientes/ClientesListClient'

export default async function AdminClientesPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.clientes,
    resource: `route:${ROUTES.admin.clientes}`,
  })

  const resultado = await buscarClientesPaginadosAction(1)
  const clientesIniciais = resultado.ok ? resultado.clientes : []
  const hasMoreInicial = resultado.ok ? resultado.hasMore : false

  return (
    <ClientesListClient
      idioma={session.idioma}
      locale={localeFromIdioma(session.idioma)}
      clientesIniciais={clientesIniciais}
      hasMoreInicial={hasMoreInicial}
    />
  )
}
