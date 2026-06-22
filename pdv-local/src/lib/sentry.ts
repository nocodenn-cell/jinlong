/**
 * Error Router de venda — desktop (pdv-local / Tauri + React).
 *
 * Ponto único de entrada para toda observabilidade de venda nesta camada.
 * Inicialização: chamar initSentry() no main.tsx antes de renderizar.
 * DSN: variável de ambiente VITE_SENTRY_DSN.
 *
 * Níveis:
 *   ERROR → Sentry.captureException
 *   EVENT → Sentry.addBreadcrumb apenas
 *   DEBUG → ignorado em produção
 *
 * Deduplicação por trace_id + stage + erro.message (TTL 30 s).
 * Garantia: nenhuma função lança exceção. Observabilidade nunca bloqueia o fluxo.
 */
import * as Sentry from '@sentry/browser'
import type { VendaTraceContext, VendaBreadcrumb } from '../../../shared-core/src/observability/vendaTrace'
import { VENDA_EVENTS } from '../../../shared-core/src/observability/vendaTrace'
import type { VendaErrorReport } from '../../../shared-core/src/observability/errorRouter'
import { buildDedupeKey } from '../../../shared-core/src/observability/errorRouter'

export { VENDA_EVENTS }
export type { VendaErrorReport }

let initialized = false

export function initSentry(): void {
  const dsn = (import.meta as { env?: Record<string, string> }).env?.VITE_SENTRY_DSN ?? ''
  if (!dsn || initialized) return
  initialized = true
  Sentry.init({
    dsn,
    environment: (import.meta as { env?: Record<string, string> }).env?.MODE ?? 'production',
    release: (import.meta as { env?: Record<string, string> }).env?.VITE_APP_VERSION,
    tracesSampleRate: 1.0,
    initialScope: {
      tags: { modulo: 'pdv-local', plataforma: 'desktop' },
    },
  })
}

// TTL-bounded dedup cache
const _dedupeCache = new Map<string, number>()
const DEDUPE_TTL_MS = 30_000

function _shouldSkip(key: string): boolean {
  const now = Date.now()
  for (const [k, ts] of _dedupeCache) {
    if (now - ts > DEDUPE_TTL_MS) _dedupeCache.delete(k)
  }
  if (_dedupeCache.has(key)) return true
  _dedupeCache.set(key, now)
  return false
}

/**
 * Error Router central — única função pública para erros de venda nesta camada.
 */
export function reportVendaError(report: VendaErrorReport): void {
  if (!initialized) return
  try {
    if (report.level === 'DEBUG') return // Desktop sempre ignora DEBUG (sem process.env)

    const key = buildDedupeKey(report)
    if (_shouldSkip(key)) return

    const err =
      report.error instanceof Error
        ? report.error
        : new Error(report.message ?? String(report.error ?? 'unknown'))

    if (report.level === 'ERROR') {
      Sentry.withScope((scope) => {
        scope.setTag('trace_id', report.trace_id)
        scope.setTag('modulo', 'pdv-sale')
        scope.setTag('plataforma', 'desktop')
        scope.setTag('layer', report.layer)
        scope.setTag('stage', report.stage)
        if (report.venda_id) scope.setTag('venda_id', report.venda_id)
        if (report.caixa_id) scope.setTag('caixa_id', report.caixa_id)
        if (report.evento) scope.setTag('evento', report.evento)
        scope.setContext('venda', {
          trace_id: report.trace_id,
          venda_id: report.venda_id ?? null,
          caixa_id: report.caixa_id ?? null,
          stage: report.stage,
          layer: report.layer,
          ...report.extra,
        })
        Sentry.captureException(err)
      })
    } else {
      Sentry.addBreadcrumb({
        type: 'default',
        category: 'venda',
        message: report.evento ?? report.message ?? err.message,
        level: 'info',
        data: {
          trace_id: report.trace_id,
          stage: report.stage,
          layer: report.layer,
          ...report.extra,
        },
        timestamp: Date.now() / 1000,
      })
    }
  } catch {
    // Observabilidade nunca lança
  }
}

// ─── Shims de compatibilidade ────────────────────────────────────────────────

export function setDesktopVendaScope(ctx: VendaTraceContext): void {
  if (!initialized) return
  try {
    Sentry.setTags({
      trace_id: ctx.trace_id,
      plataforma: 'desktop',
      modulo: 'pdv-sale',
      ...(ctx.venda_id ? { venda_id: ctx.venda_id } : {}),
      ...(ctx.caixa_id ? { caixa_id: ctx.caixa_id } : {}),
    })
  } catch {
    // Observabilidade não lança
  }
}

export function addDesktopVendaBreadcrumb(breadcrumb: VendaBreadcrumb): void {
  reportVendaError({
    level: 'EVENT',
    trace_id: breadcrumb.trace_id,
    layer: 'desktop',
    stage: 'unknown',
    evento: breadcrumb.event,
    message: breadcrumb.message,
    extra: breadcrumb.data ?? undefined,
  })
}

export function captureDesktopException(
  error: unknown,
  ctx: VendaTraceContext & { evento?: string; extra?: Record<string, unknown> },
): void {
  reportVendaError({
    level: 'ERROR',
    trace_id: ctx.trace_id,
    venda_id: ctx.venda_id,
    caixa_id: ctx.caixa_id,
    layer: 'desktop',
    stage: ctx.evento?.includes('sync') ? 'sync' : ctx.evento?.includes('rpc') ? 'rpc' : 'unknown',
    evento: ctx.evento,
    error,
    extra: ctx.extra,
  })
}

export function captureOutboxSyncError(
  error: unknown,
  ctx: {
    stage: 'sync' | 'resumo' | 'dlq'
    caixa_id: string | null
    limite?: number
    dlq_count?: number
  },
): void {
  reportVendaError({
    level: 'ERROR',
    trace_id: ctx.caixa_id ?? 'unknown-caixa',
    caixa_id: ctx.caixa_id ?? undefined,
    layer: 'desktop',
    stage: 'sync',
    evento: ctx.stage === 'dlq' ? VENDA_EVENTS.DLQ_ATINGIDO : VENDA_EVENTS.ERRO_SYNC_OUTBOX,
    error,
    extra: {
      stage: ctx.stage,
      limite: ctx.limite ?? null,
      dlq_count: ctx.dlq_count ?? null,
    },
  })
}
