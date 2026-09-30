import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@/lib/navigation/routes'
import { executarDiagnosticoCaixaPreProducao } from '@/app/admin/diagnostico-caixa/diagnosticoCaixa.impl'
import { DiagnosticoCaixaContent } from '@/app/admin/diagnostico-caixa/_components/DiagnosticoCaixaContent'

export const dynamic = 'force-dynamic'

export default async function AdminDiagnosticoCaixaPage() {
  await loadAdminContext({
    pathname: ROUTES.admin.diagnosticoCaixa,
    resource: `route:${ROUTES.admin.diagnosticoCaixa}`,
  })

  const inicial = await executarDiagnosticoCaixaPreProducao()

  return <DiagnosticoCaixaContent inicial={inicial} />
}
