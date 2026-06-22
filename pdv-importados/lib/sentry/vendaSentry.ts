/**
 * Error Router de venda — web (pdv-importados / Next.js).
 *
 * Ponto único de entrada para toda observabilidade de venda nesta camada.
 * Níveis:
 *   ERROR → Sentry.captureException (com tags e contexto completo)
 *   EVENT → Sentry.addBreadcrumb apenas
 *   DEBUG → ignorado em produção
 *
 * Deduplicação por trace_id + stage + erro.message (TTL 30 s).
 * Garantia: nenhuma função lança exceção. Observabilidade nunca bloqueia o fluxo.
 */
import * as Sentry from '@sentry/nextjs'
import type { VendaTraceContext, VendaBreadcrumb } from '@shared-core/src/observability/vendaTrace'
import { VENDA_EVENTS } from '@shared-core/src/observability/vendaTrace'
import type { VendaErrorReport } from '@shared-core/src/observability/errorRouter'
import { buildDedupeKey } from '@shared-core/src/observability/errorRouter'

export { VENDA_EVENTS }
export type { VendaTraceContext, VendaBreadcrumb, VendaErrorReport }

// TTL-bounded dedup cache — keys expire after 30 s to avoid memory accumulation
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
 *
 * Substituição direta de captureVendaError / captureRpcVendaError.
 * Essas funções permanecem como shims para compatibilidade com call sites existentes.
 */
export function reportVendaError(report: VendaErrorReport): void {
  try {
    if (report.level === 'DEBUG' && process.env.NODE_ENV === 'production') return

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
        scope.setTag('plataforma', report.layer)
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
        level: report.level === 'EVENT' ? 'info' : 'debug',
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
// Mantidos para não precisar alterar todos os call sites existentes.
// Novos call sites devem usar reportVendaError() diretamente.

export function setSentryVendaScope(ctx: VendaTraceContext): void {
  try {
    Sentry.setTags({
      trace_id: ctx.trace_id,
      plataforma: ctx.plataforma,
      modulo: 'pdv-sale',
      ...(ctx.venda_id ? { venda_id: ctx.venda_id } : {}),
      ...(ctx.loja_id ? { loja_id: ctx.loja_id } : {}),
      ...(ctx.caixa_id ? { caixa_id: ctx.caixa_id } : {}),
    })
    if (ctx.operador_id) Sentry.setUser({ id: ctx.operador_id })
  } catch {
    // Observabilidade não lança
  }
}

export function addVendaBreadcrumb(breadcrumb: VendaBreadcrumb): void {
  reportVendaError({
    level: 'EVENT',
    trace_id: breadcrumb.trace_id,
    layer: 'web',
    stage: 'unknown',
    evento: breadcrumb.event,
    message: breadcrumb.message,
    extra: breadcrumb.data ?? undefined,
  })
}

export function captureVendaError(
  error: unknown,
  ctx: VendaTraceContext & { evento?: string; extra?: Record<string, unknown> },
): void {
  reportVendaError({
    level: 'ERROR',
    trace_id: ctx.trace_id,
    venda_id: ctx.venda_id,
    caixa_id: ctx.caixa_id,
    layer: 'web',
    stage: ctx.evento?.includes('sync') ? 'sync' : ctx.evento?.includes('rpc') ? 'rpc' : 'unknown',
    evento: ctx.evento,
    error,
    extra: ctx.extra,
  })
}

export function captureRpcVendaError(
  errorMessage: string,
  ctx: VendaTraceContext & { rpc: string; elapsed_ms?: number },
): void {
  reportVendaError({
    level: 'ERROR',
    trace_id: ctx.trace_id,
    venda_id: ctx.venda_id,
    caixa_id: ctx.caixa_id,
    layer: 'web',
    stage: 'rpc',
    evento: VENDA_EVENTS.ERRO_RPC_VENDA,
    error: new Error(errorMessage),
    extra: { rpc: ctx.rpc, elapsed_ms: ctx.elapsed_ms ?? null },
  })
}
