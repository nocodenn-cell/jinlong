export type DiagnosticoCheckStatus = 'ok' | 'aviso' | 'falha'

export type DiagnosticoCheckCategoria =
  | 'migrations'
  | 'rpc'
  | 'grants'
  | 'flags'
  | 'caixa'
  | 'estoque'
  | 'config'

export type DiagnosticoCheck = {
  id: string
  categoria: DiagnosticoCheckCategoria
  titulo: string
  status: DiagnosticoCheckStatus
  detalhe: string
  acao?: string
}

export type DiagnosticoCaixaVeredito = 'PRONTO_PILOTO' | 'BLOQUEADO' | 'INDETERMINADO'

export type DiagnosticoCaixaResult = {
  veredito: DiagnosticoCaixaVeredito
  verificadoEm: string
  produtoCodigo: string
  totalFalhas: number
  totalAvisos: number
  checks: DiagnosticoCheck[]
  sqlScriptPath: string
}

export const PDV_DIAGNOSTICO_SQL_SCRIPT =
  'backend/supabase/scripts/verify_p0_producao.sql'

export const PDV_DIAGNOSTICO_PRODUTO_CODIGO_PADRAO = '7898512340003'

export function codigoProdutoDiagnosticoCaixa(): string {
  const raw = process.env.PDV_DIAGNOSTICO_PRODUTO_CODIGO?.trim()
  return raw || PDV_DIAGNOSTICO_PRODUTO_CODIGO_PADRAO
}

export function calcularVereditoDiagnostico(checks: DiagnosticoCheck[]): DiagnosticoCaixaVeredito {
  if (checks.some((c) => c.status === 'falha')) return 'BLOQUEADO'
  if (checks.length === 0) return 'INDETERMINADO'
  return 'PRONTO_PILOTO'
}

export function contarPorStatus(checks: DiagnosticoCheck[]): {
  totalFalhas: number
  totalAvisos: number
} {
  return {
    totalFalhas: checks.filter((c) => c.status === 'falha').length,
    totalAvisos: checks.filter((c) => c.status === 'aviso').length,
  }
}
