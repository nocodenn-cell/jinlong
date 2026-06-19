/**
 * DIAGNÓSTICO TEMPORÁRIO do fluxo de venda — REMOVER após a investigação.
 * (grep `venda-diag` para localizar todos os pontos.)
 *
 * Apenas observação: logs estruturados no console (browser p/ cliente, runtime
 * logs da Vercel p/ servidor). NÃO altera UI, UX nem lógica de negócio.
 * Correlacione client↔server pelo campo `corr` (= idempotencyKey da tentativa).
 */
/* eslint-disable no-console -- diagnóstico temporário: logging é o propósito do módulo */
export type VendaDiagCamada = 'FRONTEND' | 'BACKEND' | 'DATA_RLS'

const TAG = '[venda-diag]'

export function vendaDiag(
  level: 'info' | 'warn' | 'error',
  step: string,
  data: Record<string, unknown>,
): void {
  const payload = { step, ts: new Date().toISOString(), ...data }
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  fn(TAG, JSON.stringify(payload))
}

/**
 * Classifica um erro de backend (Supabase/Postgres) como bloqueio de RLS/dados
 * vs erro de RPC/genérico — sem alterar fluxo, só para rotular o log.
 */
export function classificarErroBackend(
  err: { code?: string | null; message?: string | null } | null | undefined,
): VendaDiagCamada {
  const code = (err?.code ?? '').toString()
  const msg = (err?.message ?? '').toLowerCase()
  if (
    code === '42501' ||
    msg.includes('row-level security') ||
    msg.includes('row level security') ||
    msg.includes('permission denied') ||
    msg.includes('not authorized')
  ) {
    return 'DATA_RLS'
  }
  return 'BACKEND'
}
