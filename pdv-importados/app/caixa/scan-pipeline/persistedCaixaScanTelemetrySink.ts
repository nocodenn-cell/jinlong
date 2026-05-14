import type { HumanTelemetryPayload, HumanTelemetryPayloadInput, ScanPipelineSink } from '../../../../shared-core/src/pdv/scan-pipeline'
import { createNoopScanPipelineSink, normalizeHumanTelemetryPayload } from '../../../../shared-core/src/pdv/scan-pipeline'

function parseSampleRate(): number {
  const raw = process.env.NEXT_PUBLIC_CAIXA_SCAN_TELEMETRY_SAMPLE_RATE
  if (raw == null || raw === '') return 0
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * Envia lotes para `POST /api/caixa/scan-telemetry` (cookie de sessão).
 * Amostragem por evento; buffer curto para reduzir carga.
 */
export function createPersistedCaixaScanTelemetrySink(): ScanPipelineSink {
  const rate = parseSampleRate()
  if (rate <= 0) {
    return createNoopScanPipelineSink()
  }

  const buffer: HumanTelemetryPayload[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (buffer.length === 0) return
    const batch = buffer.splice(0, buffer.length)
    void fetch('/api/caixa/scan-telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ events: batch }),
    }).catch(() => {})
  }

  const schedule = () => {
    if (timer != null) return
    timer = setTimeout(() => {
      timer = null
      flush()
    }, 3500)
  }

  return {
    emitTelemetry(payload: HumanTelemetryPayloadInput) {
      if (Math.random() > rate) return
      buffer.push(normalizeHumanTelemetryPayload(payload))
      if (buffer.length >= 22) flush()
      else schedule()
    },
  }
}
