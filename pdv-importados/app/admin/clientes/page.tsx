import { PageHeader } from '@/components/ui/admin-v2'
import { OperationalHubNav } from '@/components/ui/admin-v2/OperationalHubNav'
import { buscarClientesPaginadosAction } from '@/app/admin/clientes/actions'
import { ClientesListClient } from '@/app/gerente/clientes/ClientesListClient'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessagesForLocaleInput } from '@/i18n/catalogAdapter'
import { ROUTES } from '@/lib/navigation/routes'

/**
 * Admin clientes — primeiro domínio com i18n na borda (Missão 5.3).
 * Labels via catalogAdapter; erros de policy resolvidos nas Server Actions.
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
  const erroCargaInicial = inicial.ok ? null : inicial.error

  return (
    <div className="admin-v2-page" data-locale={locale}>
      <PageHeader
        title={messages.clientes.titulo}
        subtitle={messages.clientes.subtitulo}
      />
      <OperationalHubNav hub="pessoas" />
      <ClientesListClient
        idioma={legacyIdioma}
        locale={locale}
        messages={messages}
        clientesIniciais={clientesIniciais}
        hasMoreInicial={hasMoreInicial}
        erroCargaInicial={erroCargaInicial}
      />
    </div>
  )
}
