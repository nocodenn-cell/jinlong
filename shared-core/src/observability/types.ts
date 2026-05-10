/**
 * Campos canônicos para correlação entre web, desktop e Edge.
 * Valores livres ficam em `ctx` (já redigidos pelo caller quando necessário).
 */
export type ObservabilityLevel = 'warn' | 'error'

export type ActionFailurePayload = {
  stage: string
  event: string
  error_message: string
  error_code?: string
  /** Contexto adicional (sem PII — preferir IDs curtos). */
  ctx?: Record<string, string | number | boolean | null>
}

export type LogFailureSink = (level: ObservabilityLevel, payload: ActionFailurePayload) => void
