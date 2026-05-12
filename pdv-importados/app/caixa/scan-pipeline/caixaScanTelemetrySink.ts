/**
 * Implementação **opcional** do {@link ScanPipelineSink} para o caixa web.
 * O contrato permanece em `shared-core` (`ScanPipelineSink`); aqui só composição/adapters.
 */
import type { HumanTelemetryPayloadInput, ScanPipelineSink } from '../../../../shared-core/src/pdv/scan-pipeline'
import { createNoopScanPipelineSink } from '../../../../shared-core/src/pdv/scan-pipeline'

/** Produção: noop até existir backend/sampling (ver telemetria persistida). */
export function createCaixaScanTelemetrySink(): ScanPipelineSink {
  if (process.env.NODE_ENV === 'production') {
    return createNoopScanPipelineSink()
  }
  return {
    emitTelemetry(payload: HumanTelemetryPayloadInput) {
      console.debug(`[caixa.scan.telemetry] ${payload.event}`, payload)
    },
  }
}

/** Encadeia vários sinks (ex.: console dev + captura para overlay) sem acoplar o contrato. */
export function composeScanPipelineSinks(...sinks: ScanPipelineSink[]): ScanPipelineSink {
  return {
    emitTelemetry(payload: HumanTelemetryPayloadInput) {
      for (const s of sinks) {
        s.emitTelemetry(payload)
      }
    },
  }
}
