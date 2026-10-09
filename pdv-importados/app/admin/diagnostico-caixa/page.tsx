import { PageHeader } from '@/components/ui/admin-v2'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@/lib/navigation/routes'
import { executarDiagnosticoCaixaPreProducao } from '@/app/admin/diagnostico-caixa/diagnosticoCaixa.impl'
import { DiagnosticoCaixaContent } from '@/app/admin/diagnostico-caixa/_components/DiagnosticoCaixaContent'

export const dynamic = 'force-dynamic'

const RESOURCE = `route:${ROUTES.admin.diagnosticoCaixa}`

export default async function AdminDiagnosticoCaixaPage() {
  const { session, permissions } = await loadAdminContext({
    pathname: ROUTES.admin.diagnosticoCaixa,
    resource: RESOURCE,
  })

  // `loadAdminContext` só calcula permissões; quem barra é a página (mesmo padrão de Provisionamento).
  if (!permissions.resources[RESOURCE]) {
    const ui = getMessages(session.idioma).admin_ui
    return (
      <div className="admin-v2-page">
        <PageHeader title="Diagnóstico do Caixa" />
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {ui.restrito_dono_admin}
        </p>
      </div>
    )
  }

  const inicial = await executarDiagnosticoCaixaPreProducao()

  return <DiagnosticoCaixaContent inicial={inicial} />
}
