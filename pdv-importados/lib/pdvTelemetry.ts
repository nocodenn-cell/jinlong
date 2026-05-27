"use client"

/**
 * Telemetria operacional do PDV — cliente.
 *
 * Fire-and-forget: nunca bloqueia o fluxo principal.
 * Se o envio falhar (offline, rate limit, etc.) o evento é descartado silenciosamente.
 * Não substitui o pdvMetrics local — complementa: pdvMetrics = diagnóstico de sessão,
 * pdvTelemetry = persistência para análise do gerente.
 *
 * Uso:
 *   import { track } from '@/lib/pdvTelemetry'
 *   track('finalize_success', { duration_ms: 430 })
 */

export type TelemetryEvent =
  | 'finalize_started'
  | 'finalize_success'
  | 'finalize_error'
  | 'finalize_timeout'
  | 'finalize_retry'
  | 'double_click_blocked'
  | 'cross_tab_detected'
  | 'novo_cupom_blocked_during_flight'
  | 'venda_reconciled_after_timeout'
  | 'modal_opened'
  | 'product_search_started'
  | 'product_search_result'
  | 'cart_abandoned'
  | 'session_idle_logout'
  | 'caixa_aberto'
  | 'caixa_fechado'

export type TelemetryPayload = {
  event: TelemetryEvent
  duration_ms?: number
  caixa_id?: string
  metadata?: Record<string, unknown>
}

const ENDPOINT = '/api/caixa/telemetria-operacional'

/**
 * Envia um evento de telemetria de forma fire-and-forget.
 * Nunca lança exceção — falha silenciosa intencional.
 */
export function track(event: TelemetryEvent, extra?: Omit<TelemetryPayload, 'event'>): void {
  if (typeof window === 'undefined') return

  const payload: TelemetryPayload = { event, ...extra }

  // Fire-and-forget: não aguarda resposta, não bloqueia UI
  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    // keepalive garante envio mesmo se o usuário navegar para fora
    keepalive: true,
  }).catch(() => {
    // Silencioso — telemetria não pode quebrar o fluxo operacional
  })
}

/**
 * Versão com buffer para eventos de alta frequência (ex: buscas de produto).
 * Agrupa eventos e envia em lote após debounce de 2s.
 */
const _buffer: TelemetryPayload[] = []
let _flushTimer: ReturnType<typeof setTimeout> | null = null

export function trackBuffered(event: TelemetryEvent, extra?: Omit<TelemetryPayload, 'event'>): void {
  if (typeof window === 'undefined') return
  _buffer.push({ event, ...extra })

  if (_flushTimer) clearTimeout(_flushTimer)
  _flushTimer = setTimeout(() => {
    const batch = _buffer.splice(0)
    if (batch.length === 0) return
    void fetch(ENDPOINT + '/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    }).catch(() => { /* silencioso */ })
  }, 2_000)
}
