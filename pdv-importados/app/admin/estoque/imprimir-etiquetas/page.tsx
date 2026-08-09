import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { getMessages } from '@/i18n/getMessages'
import { ImprimirEtiquetasPageClient } from '@/app/gerente/estoque/imprimir-etiquetas/ImprimirEtiquetasPageClient'
import { EstoqueModuleNav } from '../_components/EstoqueModuleNav'
import { estoqueNavLabelsFromUi } from '../_components/estoqueNavLabels'

type SearchParams = { codigo?: string; produto?: string }

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminImprimirEtiquetasPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoqueImprimirEtiquetas,
    resource: `route:${ROUTES.admin.estoqueImprimirEtiquetas}`,
  })
  const ui = getMessages(session.idioma).admin_ui
  const sp = (searchParams ? await searchParams : {}) ?? {}

  return (
    <ImprimirEtiquetasPageClient
      idioma={session.idioma}
      initialCodigo={typeof sp.codigo === 'string' ? sp.codigo : undefined}
      initialProdutoId={typeof sp.produto === 'string' ? sp.produto : undefined}
      moduleNav={<EstoqueModuleNav active="etiquetas" labels={estoqueNavLabelsFromUi(ui)} />}
    />
  )
}
