import { PageShell } from '@/components/ui/admin-v2'
import { buscarClientesPaginadosAction } from '@/app/admin/clientes/actions'
import { ClientesListClient } from '@/app/gerente/clientes/ClientesListClient'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessagesForLocaleInput } from '@/i18n/catalogAdapter'
import { ROUTES } from '@shared-core/navigation/routes'

/**
 * Admin clientes — PageShell (Sprint 5 / RFC-UX-023).
 */
export default async function AdminClientesPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.clientes,
    resource: `route:${ROUTES.admin.clientes}`,
  })
  const { messages, locale, legacyIdioma } = getMessagesForLocaleInput(session.idioma)

  const inicial = await buscarClientesPaginadosAction(1)
  const clientesIniciais = inicial.ok ? inicial.clientes : []
  const hasMoreInicial = inicial.ok ? inicial.hasMore : false

  return (
    <div data-locale={locale}>
      <PageShell title={messages.clientes.titulo} subtitle={messages.clientes.subtitulo}>
        <ClientesListClient
          idioma={legacyIdioma}
          locale={locale}
          messages={messages}
          clientesIniciais={clientesIniciais}
          hasMoreInicial={hasMoreInicial}
        />
      </PageShell>
    </div>
  )
}
