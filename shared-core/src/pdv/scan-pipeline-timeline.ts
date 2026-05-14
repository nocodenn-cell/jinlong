/**
 * Reconstrução linear de eventos por `scanId` — debug mental “event sourcing” / testes.
 * Não substitui backend; ordena payloads já coletados (ex.: spy de `emitTelemetry`).
 */
import type { HumanTelemetryPayload } from './scan-pipeline'

export type ScanTimelineRow = {
  at: number
  event: string
  scanId: string
  sequenceNumber?: number
  durationMs?: number
  reason?: string
}

/**
 * Filtra por `scanId`, ordena por `at` e devolve linhas legíveis para logs ou asserts em teste.
 */
export function buildScanTimeline(
  events: ReadonlyArray<Pick<HumanTelemetryPayload, 'at' | 'event' | 'scanId' | 'sequenceNumber' | 'durationMs' | 'reason'>>,
  scanId: string,
): ScanTimelineRow[] {
  return events
    .filter((e) => e.scanId === scanId)
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((e) => ({
      at: e.at,
      event: e.event,
      scanId: e.scanId,
      ...(e.sequenceNumber != null ? { sequenceNumber: e.sequenceNumber } : {}),
      ...(e.durationMs != null ? { durationMs: e.durationMs } : {}),
      ...(e.reason != null ? { reason: e.reason } : {}),
    }))
}
