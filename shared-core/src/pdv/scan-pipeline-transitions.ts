/**
 * Transições de `ScanState` — **enforcement** central (único local para estados terminais pós-handler
 * e para cancelamento na fila em `flush`). O runner não deve atribuir `acknowledged` / `failed` /
 * `cancelled` nem marcos `processingFinishedAt` fora daqui.
 *
 * Ver docs/SCAN_PIPELINE_STATE_MACHINE.md.
 */
import type { HumanTelemetryPayloadInput, QueuedScan, ScanProcessResult, ScanState } from './scan-pipeline'

/** Estados terminais que o motor PR 2A aplica após o handler. */
export type ScanTerminalState = Extract<ScanState, 'acknowledged' | 'failed' | 'cancelled'>

export type ProcessingCompletionEmit = (
  payload: HumanTelemetryPayloadInput,
  scanForCtx?: Readonly<QueuedScan> | null,
) => void

export type ApplyScanProcessingCompletionResult =
  | { ok: true }
  | { ok: false; reason: 'double_finalize' }

const TERMINAL_FROM_PROCESSING: readonly ScanTerminalState[] = ['acknowledged', 'failed', 'cancelled']

/**
 * Runner retirou o item da fila de espera e inicia o handler (único caminho válido `queued` → `processing`).
 */
export function transitionQueuedScanToProcessing(scan: QueuedScan, t0: number): void {
  if (scan.state !== 'queued') {
    throw new Error(
      `[scan-pipeline] invariant: runner só desloca "queued" → "processing"; recebido "${scan.state}".`,
    )
  }
  scan.state = 'processing'
  scan.stage = 'product_lookup_started'
  scan.attempts += 1
  scan.timestamps.processingStartedAt = t0
}

/**
 * Mapa de transições **permitidas** (documento vivo — alterar com PR que toque no motor).
 * `pending_resolution` não entra até existir semântica ativa no runner (ver doc de estado).
 */
export function isAllowedScanStateTransition(from: ScanState, to: ScanState): boolean {
  if (from === 'queued' && (to === 'processing' || to === 'cancelled')) return true
  if (from === 'processing' && (TERMINAL_FROM_PROCESSING as readonly ScanState[]).includes(to)) return true
  return false
}

/**
 * Itens ainda na fila de espera quando `flush({ discardPending: true })` — devem estar em `queued`.
 */
export function transitionDiscardedQueuedScanToCancelled(scan: QueuedScan, now: number): void {
  if (scan.state !== 'queued') {
    throw new Error(
      `[scan-pipeline] invariant: flush só cancela itens em espera com state "queued"; recebido "${scan.state}".`,
    )
  }
  scan.state = 'cancelled'
  scan.timestamps.cancelledAt = now
}

/**
 * Após o handler: telemetria de conclusão + estado terminal.
 * Só aceita origem `processing`; caso contrário emite `double_finalize_attempt` e devolve falha.
 */
export function applyScanProcessingCompletion(
  scan: QueuedScan,
  result: ScanProcessResult,
  ctx: { t0: number; t1: number; queueDepth: number },
  emit: ProcessingCompletionEmit,
): ApplyScanProcessingCompletionResult {
  if (scan.state !== 'processing') {
    emit(
      {
        scanId: scan.event.id,
        sequenceNumber: scan.sequenceNumber,
        event: 'double_finalize_attempt',
        at: ctx.t1,
        queueDepth: ctx.queueDepth,
        ctx: { state: scan.state },
      },
      scan,
    )
    return { ok: false, reason: 'double_finalize' }
  }

  let terminal: ScanTerminalState
  if (result.ok) {
    terminal = 'acknowledged'
  } else if (result.reason === 'aborted') {
    terminal = 'cancelled'
  } else {
    terminal = 'failed'
  }

  if (!isAllowedScanStateTransition('processing', terminal)) {
    throw new Error(`[scan-pipeline] transição impossível processing → ${terminal}`)
  }

  scan.timestamps.processingFinishedAt = ctx.t1
  const processingMs = Math.max(0, ctx.t1 - ctx.t0)
  const totalMs = Math.max(0, ctx.t1 - scan.event.receivedAt)

  emit(
    {
      scanId: scan.event.id,
      sequenceNumber: scan.sequenceNumber,
      event: 'scan_processing_finished',
      at: ctx.t1,
      durationMs: processingMs,
      queueDepth: ctx.queueDepth,
    },
    scan,
  )
  emit(
    {
      scanId: scan.event.id,
      sequenceNumber: scan.sequenceNumber,
      event: 'processing_duration_ms',
      at: ctx.t1,
      durationMs: processingMs,
      queueDepth: ctx.queueDepth,
    },
    scan,
  )
  emit(
    {
      scanId: scan.event.id,
      sequenceNumber: scan.sequenceNumber,
      event: 'scan_latency_total',
      at: ctx.t1,
      durationMs: totalMs,
      queueDepth: ctx.queueDepth,
    },
    scan,
  )
  emit(
    {
      scanId: scan.event.id,
      sequenceNumber: scan.sequenceNumber,
      event: 'scan_total_duration_ms',
      at: ctx.t1,
      durationMs: totalMs,
      queueDepth: ctx.queueDepth,
    },
    scan,
  )

  if (!result.ok) {
    if (result.reason === 'aborted') {
      emit(
        {
          scanId: scan.event.id,
          sequenceNumber: scan.sequenceNumber,
          event: 'scan_processing_aborted',
          at: ctx.t1,
          reason: 'aborted',
          queueDepth: ctx.queueDepth,
        },
        scan,
      )
    } else {
      emit(
        {
          scanId: scan.event.id,
          sequenceNumber: scan.sequenceNumber,
          event: 'scan_failed',
          at: ctx.t1,
          reason: result.reason,
          queueDepth: ctx.queueDepth,
        },
        scan,
      )
    }
  }

  if (terminal === 'acknowledged') {
    scan.state = 'acknowledged'
    scan.timestamps.acknowledgedAt = ctx.t1
  } else if (terminal === 'cancelled') {
    scan.state = 'cancelled'
    scan.timestamps.cancelledAt = ctx.t1
  } else {
    scan.state = 'failed'
    scan.timestamps.failedAt = ctx.t1
  }

  return { ok: true }
}
