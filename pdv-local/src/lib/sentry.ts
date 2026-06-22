/**
 * Sentry para o PDV Desktop (Tauri + React).
 *
 * Inicialização: chamar initSentry() no main.tsx antes de renderizar.
 * DSN: variável de ambiente VITE_SENTRY_DSN.
 *
 * Se VITE_SENTRY_DSN não estiver definida, todas as funções são no-ops seguros.
 *
 * Instalar dependência (uma vez):
 *   pnpm --filter pdv-local add @sentry/browser
 */
import * as Sentry from '@sentry/browser'
import type { VendaTraceContext, VendaBreadcrumb } from '../../../shared-core/src/observability/vendaTrace'
import { VENDA_EVENTS } from '../../../shared-core/src/observability/vendaTrace'

export { VENDA_EVENTS }

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

/**
 * Define o contexto de venda no scope do Sentry para o desktop.
 */
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

/**
 * Registra breadcrumb de negócio no Sentry.
 */
export function addDesktopVendaBreadcrumb(breadcrumb: VendaBreadcrumb): void {
  if (!initialized) return
  try {
    Sentry.addBreadcrumb({
      type: 'default',
      category: 'venda',
      message: breadcrumb.message ?? breadcrumb.event,
      level: breadcrumb.level ?? 'info',
      data: { event: breadcrumb.event, trace_id: breadcrumb.trace_id, ...breadcrumb.data },
      timestamp: Date.now() / 1000,
    })
  } catch {
    // Observabilidade não lança
  }
}

/**
 * Captura exceção com contexto de venda no desktop.
 * Nunca lança — observabilidade é transparente para o fluxo principal.
 */
export function captureDesktopException(
  error: unknown,
  ctx: VendaTraceContext & { evento?: string; extra?: Record<string, unknown> },
): void {
  if (!initialized) return
  try {
    Sentry.withScope((scope) => {
      scope.setTag('trace_id', ctx.trace_id)
      scope.setTag('modulo', 'pdv-sale')
      scope.setTag('plataforma', 'desktop')
      if (ctx.venda_id) scope.setTag('venda_id', ctx.venda_id)
      if (ctx.caixa_id) scope.setTag('caixa_id', ctx.caixa_id)
      if (ctx.evento) scope.setTag('evento', ctx.evento)
      scope.setContext('venda', {
        trace_id: ctx.trace_id,
        venda_id: ctx.venda_id ?? null,
        caixa_id: ctx.caixa_id ?? null,
        total_liquido: ctx.total_liquido ?? null,
        itens_count: ctx.itens_count ?? null,
        ...ctx.extra,
      })
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)))
    })
  } catch {
    // Observabilidade não lança
  }
}

/**
 * Captura erro de sync do outbox com contexto estruturado.
 * Permite responder: "foi falha de rede ou rejeição da Edge Function?"
 */
export function captureOutboxSyncError(
  error: unknown,
  ctx: {
    stage: 'sync' | 'resumo' | 'dlq'
    caixa_id: string | null
    limite?: number
    dlq_count?: number
  },
): void {
  captureDesktopException(error, {
    trace_id: ctx.caixa_id ?? 'unknown-caixa',
    caixa_id: ctx.caixa_id ?? undefined,
    plataforma: 'desktop',
    evento: ctx.stage === 'dlq' ? VENDA_EVENTS.DLQ_ATINGIDO : VENDA_EVENTS.ERRO_SYNC_OUTBOX,
    extra: {
      stage: ctx.stage,
      limite: ctx.limite ?? null,
      dlq_count: ctx.dlq_count ?? null,
    },
  })
}
