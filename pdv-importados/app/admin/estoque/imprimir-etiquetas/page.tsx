/**
 * FastProduct Admin — Impressão de etiquetas
 *
 * Server Component. Reutiliza o fluxo EXISTENTE de /gerente/estoque/imprimir-etiquetas
 * (ImprimirEtiquetasPageClient). Nenhuma lógica nova — apenas expõe o módulo
 * (antes órfão via redirect para /admin/estoque) na navegação admin.
 */

import { PageHeader } from '@/components/ui/admin-v2'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { ImprimirEtiquetasPageClient } from '@/app/gerente/estoque/imprimir-etiquetas/ImprimirEtiquetasPageClient'

export const dynamic = 'force-dynamic'

export default async function AdminImprimirEtiquetasPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoqueImprimirEtiquetas,
    resource: `route:${ROUTES.admin.estoqueImprimirEtiquetas}`,
  })

  return (
    <div className="admin-v2-page">
      <PageHeader title="Impressão de etiquetas" />
      <ImprimirEtiquetasPageClient idioma={session.idioma} />
    </div>
  )
}
