import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/admin-v2'
import { CatalogoHubNav } from '@/components/ui/admin-v2/CatalogoHubNav'
import { buscarFornecedoresPaginadosAction } from '@/app/gerente/fornecedores/actions'
import { FornecedoresListClient } from '@/app/gerente/fornecedores/FornecedoresListClient'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'

export default async function AdminFornecedoresPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.fornecedores,
    resource: `route:${ROUTES.admin.fornecedores}`,
  })
  const m = getMessages(session.idioma)

  const inicial = await buscarFornecedoresPaginadosAction(1)
  const fornecedoresIniciais = inicial.ok ? inicial.fornecedores : []
  const hasMoreInicial = inicial.ok ? inicial.hasMore : false
  const erroInicial = inicial.ok ? null : inicial.error

  return (
    <div className="admin-v2-page">
      <PageHeader
        title={m.fornecedores.titulo}
        subtitle={m.fornecedores.subtitulo}
      />
      <Suspense fallback={<div className="h-9" aria-hidden />}>
        <CatalogoHubNav />
      </Suspense>
      <FornecedoresListClient
        idioma={session.idioma}
        fornecedoresIniciais={fornecedoresIniciais}
        hasMoreInicial={hasMoreInicial}
        erroInicial={erroInicial}
      />
    </div>
  )
}
