import { executarDiagnosticoCaixaPreProducao } from '@/app/admin/diagnostico-caixa/diagnosticoCaixa.impl'
import { DiagnosticoCaixaContent } from '@/app/admin/diagnostico-caixa/_components/DiagnosticoCaixaContent'

export const dynamic = 'force-dynamic'

export default async function AdminDiagnosticoCaixaPage() {
  // executarDiagnosticoCaixaPreProducao() já chama loadAdminContext internamente
  // (é o mesmo guard usado pela server action de "rodar novamente" em
  // DiagnosticoCaixaContent, que não tem gate próprio) — chamar aqui de novo
  // seria redundante.
  const inicial = await executarDiagnosticoCaixaPreProducao()

  return <DiagnosticoCaixaContent inicial={inicial} />
}
