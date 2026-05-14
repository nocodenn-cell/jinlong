import { describe, expect, it, vi } from 'vitest'
import { createScanPipelineController } from './scan-pipeline-runtime'
import { HUMAN_TELEMETRY_SCHEMA_VERSION, type ScanPipelineHandler } from './scan-pipeline'
import { waitForCurrentScanState } from './scan-pipeline-test-helpers'

function defer<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

async function tick(n = 10) {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

describe('DefaultScanPipelineController (PR 2A)', () => {
  it('FIFO estrito: A,B,C processam nessa ordem', async () => {
    const order: number[] = []
    const handler: ScanPipelineHandler = async ({ scan }) => {
      order.push(scan.sequenceNumber)
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 50 }, handler)
    c.enqueue('A')
    c.enqueue('B')
    c.enqueue('C')
    await tick(30)
    expect(order).toEqual([1, 2, 3])
  })

  it('burst: muitos enqueues síncronos preservam ordem e nada se perde', async () => {
    const order: number[] = []
    const handler: ScanPipelineHandler = async ({ scan }) => {
      order.push(scan.sequenceNumber)
      await Promise.resolve()
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 100 }, handler)
    const n = 20
    for (let i = 0; i < n; i++) {
      const r = c.enqueue(`c${i}`)
      expect(r.ok).toBe(true)
    }
    await tick(50)
    expect(order).toEqual(Array.from({ length: n }, (_, i) => i + 1))
  })

  it('nunca mais de um handler concorrente', async () => {
    let inside = 0
    let maxConcurrent = 0
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async () => {
      inside++
      maxConcurrent = Math.max(maxConcurrent, inside)
      await gate.promise
      inside--
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 50 }, handler)
    c.enqueue('a')
    await tick()
    expect(maxConcurrent).toBe(1)

    for (let i = 0; i < 5; i++) c.enqueue(`x${i}`)
    await tick()
    expect(maxConcurrent).toBe(1)
    gate.resolve()
    await tick(40)
    expect(inside).toBe(0)
  })

  it('reject_new: fila de espera cheia falha enqueue', async () => {
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async () => {
      await gate.promise
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 2 }, handler)
    expect(c.enqueue('a').ok).toBe(true)
    await tick()
    expect(c.enqueue('b').ok).toBe(true)
    expect(c.enqueue('c').ok).toBe(true)
    const d = c.enqueue('d')
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.reason).toBe('queue_full')
    gate.resolve()
    await tick(40)
  })

  it('pause: consumer não avança; resume: continua ordem', async () => {
    const processed: string[] = []
    const handler: ScanPipelineHandler = async ({ scan }) => {
      processed.push(scan.event.codigo)
      return { ok: true }
    }
    const c = createScanPipelineController(
      { maxQueueDepth: 10, enqueueWhilePaused: true },
      handler,
    )
    c.enqueue('1')
    await tick(20)
    expect(processed).toEqual(['1'])
    c.pause()
    c.enqueue('2')
    c.enqueue('3')
    await tick(20)
    expect(processed).toEqual(['1'])
    c.resume()
    await tick(30)
    expect(processed).toEqual(['1', '2', '3'])
  })

  it('enqueueWhilePaused=false: enqueue falha com pipeline_paused', () => {
    const handler: ScanPipelineHandler = async () => ({ ok: true })
    const c = createScanPipelineController(
      { maxQueueDepth: 10, enqueueWhilePaused: false },
      handler,
    )
    c.pause()
    const r = c.enqueue('x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('pipeline_paused')
  })

  it('enqueueWhilePaused=true: aceita na fila e processa após resume', async () => {
    const out: string[] = []
    const handler: ScanPipelineHandler = async ({ scan }) => {
      out.push(scan.event.codigo)
      return { ok: true }
    }
    const c = createScanPipelineController(
      { maxQueueDepth: 10, enqueueWhilePaused: true },
      handler,
    )
    c.pause()
    expect(c.enqueue('a').ok).toBe(true)
    expect(c.enqueue('b').ok).toBe(true)
    await tick(20)
    expect(out).toEqual([])
    c.resume()
    await tick(30)
    expect(out).toEqual(['a', 'b'])
  })

  it('shutdown: enqueue falha com pipeline_shutdown', async () => {
    const handler: ScanPipelineHandler = async () => ({ ok: true })
    const c = createScanPipelineController({ maxQueueDepth: 10 }, handler)
    const spy = vi.fn()
    c.subscribe(spy)
    c.shutdown()
    const r = c.enqueue('z')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('pipeline_shutdown')
    expect(spy.mock.calls.length).toBeGreaterThan(0)
  })

  it('flush descarta pendentes e marca cancelled', async () => {
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async ({ signal }) => {
      await Promise.race([
        gate.promise,
        new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => resolve(), { once: true })
        }),
      ])
      if (signal?.aborted) return { ok: false, reason: 'aborted' }
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 10 }, handler)
    c.enqueue('slow')
    await waitForCurrentScanState(c, 'processing')
    c.enqueue('drop1')
    c.enqueue('drop2')
    c.flush({ discardPending: true, reason: 'test' })
    expect(c.getQueueDepth()).toBe(0)
    await tick(30)
    expect(c.getCurrentScan()).toBeNull()
    gate.resolve()
    await tick(10)
  })

  it('getSnapshot e subscribe refletem queueDepth e isProcessing', async () => {
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async () => {
      await gate.promise
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 10 }, handler)
    const snaps: ReturnType<typeof c.getSnapshot>[] = []
    c.subscribe((s) => snaps.push({ ...s, currentScan: s.currentScan }))
    c.enqueue('x')
    await tick()
    const last = snaps[snaps.length - 1]
    expect(last.isProcessing).toBe(true)
    expect(last.queueDepth).toBe(0)
    gate.resolve()
    await tick(20)
    expect(c.getSnapshot().isProcessing).toBe(false)
  })

  it('código vazio retorna invalid_code', () => {
    const c = createScanPipelineController({ maxQueueDepth: 10 }, async () => ({
      ok: true,
    }))
    const r = c.enqueue('   ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('invalid_code')
  })

  it('backpressureStrategy !== reject_new lança na fábrica', () => {
    expect(() =>
      createScanPipelineController(
        { maxQueueDepth: 10, backpressureStrategy: 'drop_oldest' },
        async () => ({ ok: true }),
      ),
    ).toThrow(/reject_new/)
  })

  it('dedupeWindowMs suprime duplicado temporal', () => {
    let n = 0
    const handler: ScanPipelineHandler = async () => {
      n++
      return { ok: true }
    }
    const c = createScanPipelineController(
      { maxQueueDepth: 10, dedupeWindowMs: 60_000 },
      handler,
    )
    expect(c.enqueue('same').ok).toBe(true)
    const r2 = c.enqueue('same')
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.reason).toBe('duplicate_suppressed')
  })

  it('telemetria: enqueue emite scan_received', async () => {
    const emitTelemetry = vi.fn()
    const c = createScanPipelineController(
      { maxQueueDepth: 10 },
      async () => ({ ok: true }),
      { telemetry: { emitTelemetry } },
    )
    c.enqueue('x')
    await tick(20)
    expect(emitTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'scan_received',
        schemaVersion: HUMAN_TELEMETRY_SCHEMA_VERSION,
      }),
    )
  })

  it('telemetria: fila cheia emite scan_dropped com queue_full', async () => {
    const emitTelemetry = vi.fn()
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async () => {
      await gate.promise
      return { ok: true }
    }
    const c = createScanPipelineController(
      { maxQueueDepth: 2 },
      handler,
      { telemetry: { emitTelemetry } },
    )
    expect(c.enqueue('a').ok).toBe(true)
    await tick()
    expect(c.enqueue('b').ok).toBe(true)
    expect(c.enqueue('c').ok).toBe(true)
    const d = c.enqueue('d')
    expect(d.ok).toBe(false)
    expect(emitTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'scan_dropped',
        reason: 'queue_full',
        schemaVersion: HUMAN_TELEMETRY_SCHEMA_VERSION,
      }),
    )
    gate.resolve()
    await tick(40)
  })

  it('flush new_cupom emite scans_cancelled_on_new_cupom', async () => {
    const emitTelemetry = vi.fn()
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async ({ signal }) => {
      await Promise.race([
        gate.promise,
        new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => resolve(), { once: true })
        }),
      ])
      if (signal?.aborted) return { ok: false, reason: 'aborted' }
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 10 }, handler, {
      telemetry: { emitTelemetry },
    })
    c.enqueue('a')
    await tick()
    c.enqueue('b')
    c.flush({ discardPending: true, reason: 'new_cupom' })
    expect(emitTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'scans_cancelled_on_new_cupom',
        schemaVersion: HUMAN_TELEMETRY_SCHEMA_VERSION,
        ctx: expect.objectContaining({ waitingCancelled: 1, currentAborted: 1, total: 2 }),
      }),
    )
    gate.resolve()
    await tick(20)
  })

  it('passa AbortSignal ao handler', async () => {
    let received: AbortSignal | undefined
    const c = createScanPipelineController({ maxQueueDepth: 10 }, async ({ signal }) => {
      received = signal
      return { ok: true }
    })
    c.enqueue('z')
    await tick(15)
    expect(received).toBeDefined()
    expect(received?.aborted).toBe(false)
  })

  it('telemetria: duplicado temporal emite scan_duplicate_detected', () => {
    const emitTelemetry = vi.fn()
    const c = createScanPipelineController(
      { maxQueueDepth: 10, dedupeWindowMs: 60_000 },
      async () => ({ ok: true }),
      { telemetry: { emitTelemetry } },
    )
    expect(c.enqueue('dup').ok).toBe(true)
    const r2 = c.enqueue('dup')
    expect(r2.ok).toBe(false)
    expect(emitTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'scan_duplicate_detected',
        schemaVersion: HUMAN_TELEMETRY_SCHEMA_VERSION,
      }),
    )
  })
})
