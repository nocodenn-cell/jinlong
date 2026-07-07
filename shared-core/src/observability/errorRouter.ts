/**
 * Contrato do Error Router de venda — platform-agnostic.
 *
 * Define o tipo canônico VendaErrorReport e a lógica de deduplicação por chave.
 * Cada plataforma (web, desktop, edge) implementa reportVendaError() usando este contrato
 * e o respectivo SDK do Sentry.
 *
 * Níveis:
 *   ERROR → captureException no Sentry
 *   EVENT → breadcrumb apenas (sem alerta)
 *   DEBUG → ignorado em produção
 *
 * Deduplicação: trace_id + stage + mensagem do erro. Evita eventos duplicados
 * quando múltiplos caminhos de código capturam o mesmo erro na mesma venda.
 */

export type VendaErrorLevel = 'ERROR' | 'EVENT' | 'DEBUG'

export type VendaErrorReport = {
  level: VendaErrorLevel
  trace_id: string
  venda_id?: string
  caixa_id?: string
  /** Plataforma de origem do erro. */
  layer: 'web' | 'desktop' | 'edge'
  /** Stage do fluxo onde o erro ocorreu. */
  stage: 'rpc' | 'sync' | 'ui' | 'unknown'
  /** Evento de negócio (VENDA_EVENTS.*). */
  evento?: string
  error?: unknown
  message?: string
  extra?: Record<string, unknown>
}

/** Gera a chave de deduplicação para um VendaErrorReport. */
export function buildDedupeKey(
  report: Pick<VendaErrorReport, 'trace_id' | 'stage'> & {
    error?: unknown
    message?: string
  },
): string {
  const errMsg =
    report.error instanceof Error
      ? report.error.message
      : (report.message ?? String(report.error ?? ''))
  return `${report.trace_id}:${report.stage}:${errMsg}`
}
