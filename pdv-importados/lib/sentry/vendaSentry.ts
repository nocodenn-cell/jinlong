/**
 * Sentry helpers para o fluxo de venda — web (pdv-importados).
 *
 * Funções:
 *   setSentryVendaScope   — define tags de venda no scope atual do Sentry
 *   addVendaBreadcrumb    — registra evento de negócio como breadcrumb
 *   captureVendaError     — captura exceção com contexto completo de venda
 *   captureRpcVendaError  — atalho para erros de RPC
 *
 * Garantia: nenhuma função lança exceção. Observabilidade nunca bloqueia o fluxo.
 */
import * as Sentry from '@sentry/nextjs'
import type { VendaTraceContext, VendaBreadcrumb } from '@shared-core/src/observability/vendaTrace'
import { VENDA_EVENTS } from '@shared-core/src/observability/vendaTrace'

export { VENDA_EVENTS }
export type { VendaTraceContext, VendaBreadcrumb }

/**
 * Define o contexto da venda ativa no scope do Sentry.
 * Chamar no início do fluxo de venda, antes de qualquer RPC.
 * Atualizar novamente quando venda_id for conhecido (após RPC).
 */
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
    if (ctx.operador_id) {
      Sentry.setUser({ id: ctx.operador_id })
    }
  } catch {
    // Observabilidade não lança
  }
}

/**
 * Registra um evento de negócio como breadcrumb no Sentry.
 * Breadcrumbs aparecem na timeline do issue no dashboard.
 */
export function addVendaBreadcrumb(breadcrumb: VendaBreadcrumb): void {
  try {
    Sentry.addBreadcrumb({
      type: 'default',
      category: 'venda',
      message: breadcrumb.message ?? breadcrumb.event,
      level: breadcrumb.level ?? 'info',
      data: {
        event: breadcrumb.event,
        trace_id: breadcrumb.trace_id,
        ...breadcrumb.data,
      },
      timestamp: Date.now() / 1000,
    })
  } catch {
    // Observabilidade não lança
  }
}

/**
 * Captura exceção com contexto completo da venda ativa.
 * Responde as perguntas: onde falhou? em qual layer? qual venda?
 */
export function captureVendaError(
  error: unknown,
  ctx: VendaTraceContext & { evento?: string; extra?: Record<string, unknown> },
): void {
  try {
    Sentry.withScope((scope) => {
      scope.setTag('trace_id', ctx.trace_id)
      scope.setTag('modulo', 'pdv-sale')
      scope.setTag('plataforma', ctx.plataforma)
      if (ctx.venda_id) scope.setTag('venda_id', ctx.venda_id)
      if (ctx.caixa_id) scope.setTag('caixa_id', ctx.caixa_id)
      if (ctx.evento) scope.setTag('evento', ctx.evento)
      if (ctx.loja_id) scope.setTag('loja_id', ctx.loja_id)
      scope.setContext('venda', {
        trace_id: ctx.trace_id,
        venda_id: ctx.venda_id ?? null,
        caixa_id: ctx.caixa_id ?? null,
        operador_id: ctx.operador_id ?? null,
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
 * Atalho para falhas de RPC de venda.
 * Pergunta respondida: "foi erro de RPC ou de sync?"
 */
export function captureRpcVendaError(
  errorMessage: string,
  ctx: VendaTraceContext & { rpc: string; elapsed_ms?: number },
): void {
  captureVendaError(new Error(errorMessage), {
    ...ctx,
    evento: VENDA_EVENTS.ERRO_RPC_VENDA,
    extra: { rpc: ctx.rpc, elapsed_ms: ctx.elapsed_ms ?? null },
  })
}