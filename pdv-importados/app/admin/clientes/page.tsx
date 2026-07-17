import { PageHeader } from '@/components/ui/admin-v2'
import { buscarClientesPaginadosAction } from '@/app/gerente/clientes/actions'
import { ClientesListClient } from '@/app/gerente/clientes/ClientesListClient'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { ROUTES } from '@shared-core/navigation/routes'

export default async function AdminClientesPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.clientes,
    resource: `route:${ROUTES.admin.clientes}`,
  })
  const m = getMessages(session.idioma)
  const locale = localeFromIdioma(session.idioma)

  const inicial = await buscarClientesPaginadosAction(1)
  const clientesIniciais = inicial.ok ? inicial.clientes : []
  const hasMoreInicial = inicial.ok ? inicial.hasMore : false
  // inicial.error: falha real de carga (RLS, rede) — distinto de "nenhum cliente".
  const loadErrorInicial = !inicial.ok ? inicial.error : null

  return (
    <div className="admin-v2-page">
      <PageHeader title={m.clientes.titulo} subtitle={m.clientes.subtitulo} />
      <ClientesListClient
        idioma={session.idioma}
        locale={locale}
        clientesIniciais={clientesIniciais}
        hasMoreInicial={hasMoreInicial}
        loadErrorInicial={loadErrorInicial}
      />
    </div>
  )
}
