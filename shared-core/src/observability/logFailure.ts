import type { ActionFailurePayload, LogFailureSink, ObservabilityLevel } from './types'

export function buildActionFailurePayload(
  stage: string,
  event: string,
  err: unknown,
  ctx?: Record<string, string | number | boolean | null>,
): ActionFailurePayload {
  const error_message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
  return {
    stage,
    event,
    error_message,
    ctx,
  }
}

/** Emite log estruturado via sink injetável (sem acoplar a console / Sentry). */
export function logActionFailure(
  sink: LogFailureSink | undefined,
  level: ObservabilityLevel,
  payload: ActionFailurePayload,
): void {
  sink?.(level, payload)
}
