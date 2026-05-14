/**
 * Cenários dourados (regressão semântica) — pipeline de bip.
 * Espera por **marcos observáveis** (`waitUntil` / `waitForCurrentScanState`), não por contagem fixa de microtasks.
 * Ver docs/RECONNECT_REPLAY_POLICY.md, docs/SCAN_PIPELINE_STATE_MACHINE.md e checklist em .github/pull_request_template.md.
 */
import { describe, expect, it, vi } from 'vitest'
import { createScanPipelineController } from './scan-pipeline-runtime'
import type { ScanPipelineHandler } from './scan-pipeline'
import { waitForCurrentScanState, waitUntil } from './scan-pipeline-test-helpers'

function defer<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

async function tick(n = 15) {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

describe('Golden scenarios — scan pipeline (semantic regression)', () => {
  it('burst 20: ordem FIFO e sequenceNumber 1..20', async () => {
    const order: number[] = []
    const handler: ScanPipelineHandler = async ({ scan }) => {
      order.push(scan.sequenceNumber)
      await Promise.resolve()
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 100 }, handler)
    const n = 20
    for (let i = 0; i < n; i++) {
      expect(c.enqueue(`sku-${i}`).ok).toBe(true)
    }
    await waitUntil(() => order.length === n, { description: 'todas as 20 leituras processadas' })
    expect(order).toEqual(Array.from({ length: n }, (_, i) => i + 1))
  })

  it('novo cupom durante “pricing” lento: flush aborta atual e emite scans_cancelled_on_new_cupom', async () => {
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
    c.enqueue('slow')
    await waitForCurrentScanState(c, 'processing')
    c.enqueue('queued')
    await waitUntil(() => c.getQueueDepth() === 1, { description: 'segundo item na fila de espera' })
    c.flush({ discardPending: true, reason: 'new_cupom' })
    expect(emitTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'scans_cancelled_on_new_cupom' }),
    )
    gate.resolve()
    await waitUntil(() => c.getCurrentScan() === null && c.getQueueDepth() === 0, {
      description: 'runner terminou após flush',
    })
  })

  it('abort durante queue_wait: item na fila é cancelado sem handler', async () => {
    const processed: string[] = []
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async ({ scan, signal }) => {
      if (scan.event.codigo === 'first') {
        await Promise.race([
          gate.promise,
          new Promise<void>((r) => signal?.addEventListener('abort', () => r(), { once: true })),
        ])
        if (signal?.aborted) return { ok: false, reason: 'aborted' }
        processed.push('first')
        return { ok: true }
      }
      processed.push(scan.event.codigo)
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 10 }, handler)
    c.enqueue('first')
    await waitForCurrentScanState(c, 'processing')
    c.enqueue('second')
    await waitUntil(() => c.getQueueDepth() === 1, { description: 'second em queue_wait' })
    c.flush({ discardPending: true, reason: 'manual' })
    expect(c.getQueueDepth()).toBe(0)
    gate.resolve()
    await waitUntil(() => c.getCurrentScan() === null, { description: 'first scan terminou após gate' })
    expect(processed).not.toContain('second')
  })

  it('queue_full em rajada: enqueues após fila cheia falham com queue_full', async () => {
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async () => {
      await gate.promise
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 2 }, handler)
    expect(c.enqueue('a').ok).toBe(true)
    await waitForCurrentScanState(c, 'processing')
    expect(c.enqueue('b').ok).toBe(true)
    expect(c.enqueue('c').ok).toBe(true)
    await waitUntil(() => c.getQueueDepth() === 2, { description: 'dois itens em espera (b e c)' })
    for (let i = 0; i < 5; i++) {
      const r = c.enqueue(`x${i}`)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('queue_full')
    }
    gate.resolve()
    await waitUntil(() => !c.isProcessing() && c.getQueueDepth() === 0, { description: 'fila drenada' })
  })

  it('double submit sequencial: dois enqueues distintos processam ambos (sem dedupe)', async () => {
    const codes: string[] = []
    const handler: ScanPipelineHandler = async ({ scan }) => {
      codes.push(scan.event.codigo)
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 10, dedupeWindowMs: 0 }, handler)
    expect(c.enqueue('111').ok).toBe(true)
    expect(c.enqueue('111').ok).toBe(true)
    await waitUntil(() => codes.length === 2, { description: 'ambos os enqueues processados' })
    expect(codes).toEqual(['111', '111'])
  })

  it('reconnect proxy: handler vê signal.aborted durante operação longa', async () => {
    const steps: string[] = []
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async ({ signal }) => {
      steps.push('a')
      await Promise.race([
        gate.promise,
        new Promise<void>((r) => signal?.addEventListener('abort', () => r(), { once: true })),
      ])
      if (signal?.aborted) {
        steps.push('aborted')
        return { ok: false, reason: 'aborted' }
      }
      steps.push('ok')
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 10 }, handler)
    c.enqueue('x')
    await waitForCurrentScanState(c, 'processing')
    c.shutdown()
    await waitUntil(() => steps.includes('aborted'), { description: 'handler observou abort cooperativo' })
    expect(steps).toContain('aborted')
    gate.resolve()
    await tick(5)
  })
})
