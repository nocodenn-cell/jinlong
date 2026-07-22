'use server'

import { executarDiagnosticoCaixaPreProducao } from '@/app/admin/diagnostico-caixa/diagnosticoCaixa.impl'
import type { DiagnosticoCaixaResult } from '@/lib/caixa/diagnosticoPreProducaoTypes'

export type ExecutarDiagnosticoCaixaResult =
  | ({ ok: true } & DiagnosticoCaixaResult)
  | { ok: false; error: string }

export async function executarDiagnosticoCaixaAction(): Promise<ExecutarDiagnosticoCaixaResult> {
  try {
    const res = await executarDiagnosticoCaixaPreProducao()
    return { ok: true, ...res }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Falha ao executar diagnóstico.',
    }
  }
}
