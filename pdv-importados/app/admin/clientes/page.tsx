/**
 * FastProduct Admin — Clientes
 *
 * Server Component. Reutiliza os componentes e actions EXISTENTES de
 * /gerente/clientes (ClientesListClient + buscarClientesPaginadosAction).
 * Nenhuma query nova — apenas expõe o módulo (antes órfão) na navegação admin.
 */

import { PageHeader } from '@/components/ui/admin-v2'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { ROUTES } from '@shared-core/navigation/routes'
import { buscarClientesPaginadosAction } from '@/app/gerente/clientes/actions'
import { ClientesListClient } from '@/app/gerente/clientes/ClientesListClient'

export const dynamic = 'force-dynamic'

export default async function AdminClientesPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.clientes,
    resource: `route:${ROUTES.admin.clientes}`,
  })
  const m = getMessages(session.idioma)
  const locale = localeFromIdioma(session.idioma)

  const res = await buscarClientesPaginadosAction(1)
  const clientesIniciais = res.ok ? res.clientes : []
  const hasMoreInicial = res.ok ? res.hasMore : false

  return (
    <div className="admin-v2-page">
      <PageHeader title={m.clientes.titulo} />

      <ClientesListClient
        idioma={session.idioma}
        locale={locale}
        clientesIniciais={clientesIniciais}
        hasMoreInicial={hasMoreInicial}
      />
    </div>
  )
}
