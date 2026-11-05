'use server'

import { executarDiagnosticoCaixaPreProducao } from '@/app/admin/diagnostico-caixa/diagnosticoCaixa.impl'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { ROUTES } from '@/lib/navigation/routes'
import type { DiagnosticoCaixaResult } from '@/lib/caixa/diagnosticoPreProducaoTypes'

export type ExecutarDiagnosticoCaixaResult =
  | ({ ok: true } & DiagnosticoCaixaResult)
  | { ok: false; error: string }

export async function executarDiagnosticoCaixaAction(): Promise<ExecutarDiagnosticoCaixaResult> {
  // Tudo dentro do try: se a sessão não puder ser resolvida (config/Supabase indisponível), o
  // chamador recebe `{ ok:false, error }` (o contrato declarado) em vez de uma rejeição sem tratamento.
  try {
    // Guarda na própria action (não só na página): Server Actions são endpoints. Só DONO
    // (policy `route:/admin/diagnostico-caixa`); antes, só a RPC no banco barrava OPERADOR/anon.
    const auth = await assertGerenteSession({ resource: `route:${ROUTES.admin.diagnosticoCaixa}` })
    if (!auth.ok) return { ok: false, error: auth.error }

    const res = await executarDiagnosticoCaixaPreProducao()
    return { ok: true, ...res }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Falha ao executar diagnóstico.',
    }
  }
}
