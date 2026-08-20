import * as Sentry from '@sentry/nextjs'
import { redigir } from './redact'

export type VendaErrorCtx = {
  trace_id?: string
  venda_id?: string | null
  caixa_id?: string
  layer?: 'web' | 'desktop' | 'edge'
  error_code?: string
}

// Deduplicação por stage + event + mensagem truncada
// Módulo-nível: servidor → compartilhado no processo; cliente → compartilhado na sessão
const _dedupeCache = new Set<string>()
const MAX_DEDUPE_SIZE = 500

function dedupeKey(stage: string, event: string, message: string): string {
  return `${stage}\x00${event}\x00${message.slice(0, 120)}`
}

function checkAndRegister(key: string): boolean {
  if (_dedupeCache.has(key)) return false
  _dedupeCache.add(key)
  // Bounded cache: ao atingir o limite limpa tudo (simples, evita memória ilimitada)
  if (_dedupeCache.size > MAX_DEDUPE_SIZE) _dedupeCache.clear()
  return true
}

/**
 * Único ponto de entrada para erros que chegam ao Sentry.
 *
 * Níveis:
 *   error → captureException (aparece no Sentry)
 *   event → addBreadcrumb   (trilha de auditoria, não gera alerta)
 *
 * Garantias:
 *   - Nunca lança exceção (fail-safe)
 *   - Deduplicação por stage + event + mensagem
 *   - Tags de baixa cardinalidade (layer, stage, error_code)
 *   - IDs de alta cardinalidade (trace_id, venda_id) vão em context, não em tag
 */
export function reportVendaError(
  stage: string,
  event: string,
  error: unknown,
  ctx?: VendaErrorCtx,
): void {
  try {
    const message = error instanceof Error ? error.message : String(error)
    if (!checkAndRegister(dedupeKey(stage, event, message))) return

    Sentry.withScope((scope) => {
      // Tags de baixa cardinalidade — seguras para indexação no Sentry
      scope.setTag('layer', ctx?.layer ?? 'web')
      scope.setTag('stage', stage)
      if (ctx?.error_code) scope.setTag('error_code', ctx.error_code)
      if (ctx?.caixa_id) scope.setTag('caixa_id', ctx.caixa_id)

      // IDs de alta cardinalidade ficam em context (não tags) para evitar custo
      if (ctx?.trace_id || ctx?.venda_id) {
        scope.setContext('venda', {
          trace_id: ctx.trace_id ?? null,
          venda_id: ctx.venda_id ?? null,
        })
      }

      scope.setExtra('event', event)

      const err = error instanceof Error ? error : new Error(message)
      err.name = `[${stage}] ${event}`
      Sentry.captureException(err)
    })
  } catch {
    // Observabilidade nunca deve bloquear o fluxo de venda
  }
}

/**
 * Registra evento de domínio como breadcrumb (trilha de auditoria, sem alerta).
 * Use para: venda iniciada, pagamento processado, sync enviado, desconto aplicado.
 */
export function addVendaBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  try {
    Sentry.addBreadcrumb({
      category,
      message: redigir(message) as string,
      data: redigir(data) as Record<string, unknown> | undefined,
      level: 'info',
    })
  } catch {
    // fail-safe
  }
}
