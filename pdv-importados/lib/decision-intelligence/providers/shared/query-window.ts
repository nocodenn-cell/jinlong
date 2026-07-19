import type { FactQuery } from '@shared-core/src/intelligence'

const DEFAULT_WINDOW_DAYS = 90

/**
 * Janela temporal do FactQuery; default 90 dias (operação contínua).
 * Sem regras de KPI — só bound de I/O.
 */
export function resolveFactWindow(query: FactQuery, now = new Date()): {
  fromIso: string
  toIso: string
} {
  if (query.window?.fromIso && query.window?.toIso) {
    return {
      fromIso: query.window.fromIso,
      toIso: query.window.toIso,
    }
  }
  const to = now
  const from = new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000)
  return { fromIso: from.toISOString(), toIso: to.toISOString() }
}

export const FACT_LOAD_LIMIT = 5_000
