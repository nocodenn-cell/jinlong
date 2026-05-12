/**
 * Runtime serial do pipeline de bip (PR 2A).
 * Sem React, Zustand ou Supabase — apenas fila + handler injetável.
 */

import type {
  EnqueueScanResult,
  HumanTelemetryPayload,
  HumanTelemetryPayloadInput,
  QueuedScan,
  ScanEventMeta,
  ScanPipelineConfig,
  ScanPipelineController,
  ScanPipelineFlushOptions,
  ScanPipelineHandler,
  ScanPipelineListener,
  ScanPipelineSink,
  ScanPipelineSnapshot,
  ScanProcessResult,
} from './scan-pipeline'
import {
  createScanEvent,
  createNoopScanPipelineSink,
  defaultScanPipelineConfig,
  normalizeHumanTelemetryPayload,
} from './scan-pipeline'
import {
  applyScanProcessingCompletion,
  transitionDiscardedQueuedScanToCancelled,
  transitionQueuedScanToProcessing,
} from './scan-pipeline-transitions'

export type CreateScanPipelineRuntimeOptions = {
  /** Telemetria humana (p50/p95); predefinição noop. */
  telemetry?: ScanPipelineSink
}

function assertRejectNewStrategy(cfg: ScanPipelineConfig): void {
  const s = cfg.backpressureStrategy ?? 'reject_new'
  if (s !== 'reject_new') {
    throw new Error(
      `[scan-pipeline] PR 2A só implementa backpressureStrategy "reject_new"; recebido "${s}".`,
    )
  }
}

function shallowScanSnapshot(scan: QueuedScan): Readonly<QueuedScan> {
  return {
    ...scan,
    event: { ...scan.event },
    timestamps: { ...scan.timestamps },
  }
}

/**
 * Fábrica do controller serial (FIFO, um consumer, estado observável).
 */
export function createScanPipelineController(
  rawConfig: Partial<ScanPipelineConfig>,
  handler: ScanPipelineHandler,
  runtimeOptions?: CreateScanPipelineRuntimeOptions,
): ScanPipelineController {
  const config = defaultScanPipelineConfig(rawConfig)
  assertRejectNewStrategy(config)
  return new DefaultScanPipelineController(config, handler, runtimeOptions)
}

class DefaultScanPipelineController implements ScanPipelineController {
  readonly config: ScanPipelineConfig

  private readonly handler: ScanPipelineHandler
  private readonly telemetry: ScanPipelineSink
  /** Itens `queued` ainda não atribuídos ao consumer. `currentScan` não conta para profundidade. */
  private waitingQueue: QueuedScan[] = []
  private currentScan: QueuedScan | null = null
  private nextSequenceNumber = 1
  private paused = false
  private destroyed = false
  /** Cadeia única de drain — nunca duas `runLoop` concorrentes. */
  private runChain: Promise<void> | null = null
  private readonly listeners = new Set<ScanPipelineListener>()
  /** Último enqueue bem-sucedido para dedupe temporal. */
  private lastEnqueue: { codigo: string; at: number } | null = null
  /** Aborta o handler do scan em curso (flush discard / shutdown). */
  private currentRunAbort: AbortController | null = null
  /** Pico de `waitingQueue.length` neste controller (exclui item em processamento). */
  private queueWaitingDepthPeak = 0

  constructor(
    config: ScanPipelineConfig,
    handler: ScanPipelineHandler,
    runtimeOptions?: CreateScanPipelineRuntimeOptions,
  ) {
    this.config = config
    this.handler = handler
    this.telemetry = runtimeOptions?.telemetry ?? createNoopScanPipelineSink()
  }

  private safeEmit(payload: HumanTelemetryPayloadInput, scanForCtx?: Readonly<QueuedScan> | null): void {
    let out: HumanTelemetryPayload = normalizeHumanTelemetryPayload(payload)
    if (scanForCtx) {
      const meta = scanForCtx.event.meta
      const cupom = meta?.cupomSessionId
      const corr = meta?.correlationId ?? cupom
      out = {
        ...out,
        ctx: {
          ...out.ctx,
          ...(cupom != null && cupom !== '' ? { cupomSessionId: cupom } : {}),
          ...(corr != null && `${corr}` !== '' ? { correlationId: corr } : {}),
        },
      }
    }
    try {
      this.telemetry.emitTelemetry(out)
    } catch {
      /* telemetria não deve derrubar o PDV */
    }
  }

  enqueue(codigo: string, meta?: ScanEventMeta): EnqueueScanResult {
    if (this.destroyed) {
      return { ok: false, reason: 'pipeline_shutdown', message: 'Pipeline encerrado.' }
    }
    const trimmed = codigo.trim()
    if (!trimmed) {
      return { ok: false, reason: 'invalid_code', message: 'Código vazio.' }
    }

    if (this.paused && !this.config.enqueueWhilePaused) {
      return { ok: false, reason: 'pipeline_paused' }
    }

    const now = Date.now()
    const dedupeMs = this.config.dedupeWindowMs ?? 0
    if (dedupeMs > 0 && this.lastEnqueue) {
      if (
        this.lastEnqueue.codigo === trimmed &&
        now - this.lastEnqueue.at < dedupeMs
      ) {
        this.safeEmit({
          scanId: 'duplicate',
          event: 'scan_duplicate_detected',
          at: now,
          ctx: { len: trimmed.length },
        })
        return { ok: false, reason: 'duplicate_suppressed' }
      }
    }

    if (this.waitingQueue.length >= this.config.maxQueueDepth) {
      this.safeEmit({
        scanId: 'enqueue',
        event: 'scan_dropped',
        at: now,
        reason: 'queue_full',
        queueDepth: this.waitingQueue.length,
      })
      return { ok: false, reason: 'queue_full' }
    }

    const seq = this.nextSequenceNumber++
    const event = createScanEvent(trimmed, meta, now)
    const scan: QueuedScan = {
      sequenceNumber: seq,
      event,
      state: 'queued',
      stage: 'ingress',
      timestamps: { enqueuedAt: now },
      attempts: 0,
    }
    this.waitingQueue.push(scan)
    this.lastEnqueue = { codigo: trimmed, at: now }

    const waitingDepth = this.waitingQueue.length
    if (waitingDepth > this.queueWaitingDepthPeak) {
      this.queueWaitingDepthPeak = waitingDepth
      this.safeEmit(
        {
          scanId: 'queue',
          event: 'queue_depth_peak',
          at: now,
          ctx: { peak: waitingDepth },
        },
        scan,
      )
    }

    this.safeEmit(
      {
        scanId: event.id,
        sequenceNumber: seq,
        event: 'scan_received',
        at: now,
        queueDepth: waitingDepth,
      },
      scan,
    )

    this.notify()
    this.kickDrain()
    return {
      ok: true,
      scanId: event.id,
      sequenceNumber: seq,
      positionInQueue: this.waitingQueue.length,
    }
  }

  pause(): void {
    if (this.destroyed) return
    this.paused = true
    this.notify()
  }

  resume(): void {
    if (this.destroyed) return
    this.paused = false
    this.notify()
    this.kickDrain()
  }

  flush(options?: ScanPipelineFlushOptions): void {
    if (this.destroyed) return

    if (options?.discardPending === true) {
      const now = Date.now()
      const waitingCount = this.waitingQueue.length
      const hadCurrent = this.currentScan !== null
      this.currentRunAbort?.abort()
      for (const scan of this.waitingQueue) {
        transitionDiscardedQueuedScanToCancelled(scan, now)
      }
      this.waitingQueue = []
      if (options.reason === 'new_cupom') {
        this.safeEmit(
          {
            scanId: 'pipeline',
            event: 'scans_cancelled_on_new_cupom',
            at: now,
            ctx: {
              waitingCancelled: waitingCount,
              currentAborted: hadCurrent ? 1 : 0,
              total: waitingCount + (hadCurrent ? 1 : 0),
            },
          },
          this.currentScan,
        )
      }
      this.notify()
      return
    }

    // discardPending false / omitido: processar até vazio — não faz nada se pausado (definir explicitamente).
    if (this.paused) {
      return
    }
    this.kickDrain()
  }

  shutdown(): void {
    if (this.destroyed) return
    this.paused = true
    this.flush({ discardPending: true, reason: 'shutdown' })
    this.destroyed = true
    this.notify()
    this.listeners.clear()
  }

  isProcessing(): boolean {
    return this.currentScan !== null
  }

  getQueueDepth(): number {
    return this.waitingQueue.length
  }

  getCurrentScan(): Readonly<QueuedScan> | null {
    return this.currentScan ? shallowScanSnapshot(this.currentScan) : null
  }

  getSnapshot(): ScanPipelineSnapshot {
    return this.buildSnapshot()
  }

  subscribe(listener: ScanPipelineListener): () => void {
    this.listeners.add(listener)
    listener(this.buildSnapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private buildSnapshot(): ScanPipelineSnapshot {
    return {
      queueDepth: this.waitingQueue.length,
      isProcessing: this.currentScan !== null,
      isPaused: this.paused,
      currentScan: this.currentScan ? shallowScanSnapshot(this.currentScan) : null,
    }
  }

  private notify(): void {
    const snap = this.buildSnapshot()
    for (const l of [...this.listeners]) {
      l(snap)
    }
  }

  private kickDrain(): void {
    if (this.destroyed) return
    if (this.runChain) return
    this.runChain = this.runLoop()
      .catch(() => {
        /* runner não deve explodir o processo */
      })
      .finally(() => {
        this.runChain = null
        if (
          !this.destroyed &&
          !this.paused &&
          this.waitingQueue.length > 0
        ) {
          this.kickDrain()
        }
      })
  }

  private async runLoop(): Promise<void> {
    while (!this.destroyed && !this.paused && this.waitingQueue.length > 0) {
      const scan = this.waitingQueue.shift()!
      this.currentScan = scan
      const t0 = Date.now()
      transitionQueuedScanToProcessing(scan, t0)
      this.notify()

      const encAt = scan.timestamps.enqueuedAt ?? scan.event.receivedAt
      const queueWaitMs = Math.max(0, t0 - encAt)
      const scanAgeMs = Math.max(0, t0 - scan.event.receivedAt)
      this.safeEmit(
        {
          scanId: scan.event.id,
          sequenceNumber: scan.sequenceNumber,
          event: 'scan_processing_started',
          at: t0,
          durationMs: queueWaitMs,
          queueDepth: this.waitingQueue.length,
        },
        scan,
      )
      this.safeEmit(
        {
          scanId: scan.event.id,
          sequenceNumber: scan.sequenceNumber,
          event: 'queue_wait_duration_ms',
          at: t0,
          durationMs: queueWaitMs,
          queueDepth: this.waitingQueue.length,
        },
        scan,
      )
      this.safeEmit(
        {
          scanId: scan.event.id,
          sequenceNumber: scan.sequenceNumber,
          event: 'current_scan_age_ms',
          at: t0,
          durationMs: scanAgeMs,
          queueDepth: this.waitingQueue.length,
        },
        scan,
      )

      const ac = new AbortController()
      this.currentRunAbort = ac
      const signal = ac.signal

      let result: ScanProcessResult
      try {
        result = await this.handler({
          scan: shallowScanSnapshot(scan),
          signal,
        })
      } catch {
        result = { ok: false, reason: 'unknown', message: 'Handler lançou exceção.' }
      } finally {
        if (this.currentRunAbort === ac) {
          this.currentRunAbort = null
        }
      }
      if (signal.aborted) {
        result = { ok: false, reason: 'aborted' }
      }

      const t1 = Date.now()
      const completion = applyScanProcessingCompletion(scan, result, { t0, t1, queueDepth: this.waitingQueue.length }, (p, s) =>
        this.safeEmit(p, s),
      )
      if (!completion.ok) {
        this.currentScan = null
        this.notify()
        if (this.destroyed) break
        continue
      }

      this.currentScan = null
      this.notify()

      if (this.destroyed) break
    }
  }
}
