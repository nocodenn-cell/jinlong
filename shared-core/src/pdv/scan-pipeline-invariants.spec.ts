/**
 * Invariantes do runtime serial — sem órfãos, término único, shutdown vs processing.
 * Espera semântica: `scan-pipeline-test-helpers.ts`. Ver docs/SCAN_PIPELINE_STATE_MACHINE.md.
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

describe('Scan pipeline — invariantes operacionais', () => {
  it('shutdown logo após enqueue: termina sem processing preso nem fila pendente', async () => {
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async ({ signal }) => {
      await Promise.race([
        gate.promise,
        new Promise<void>((r) => signal?.addEventListener('abort', () => r(), { once: true })),
      ])
      if (signal?.aborted) return { ok: false, reason: 'aborted' }
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 10 }, handler)
    expect(c.enqueue('x').ok).toBe(true)
    c.shutdown()
    await waitUntil(() => !c.isProcessing() && c.getQueueDepth() === 0, {
      description: 'pipeline deveria esvaziar após shutdown',
    })
    expect(c.getCurrentScan()).toBeNull()
    gate.resolve()
    await tick(10)
  })

  it('shutdown durante processing ativo: handler vê abort e o scan termina em cancelled', async () => {
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async ({ signal }) => {
      await Promise.race([
        gate.promise,
        new Promise<void>((r) => signal?.addEventListener('abort', () => r(), { once: true })),
      ])
      if (signal?.aborted) return { ok: false, reason: 'aborted' }
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 10 }, handler)
    expect(c.enqueue('x').ok).toBe(true)
    await waitForCurrentScanState(c, 'processing')
    c.shutdown()
    await waitUntil(() => c.getCurrentScan() === null, { description: 'currentScan libertado após abort' })
    expect(c.getSnapshot().isProcessing).toBe(false)
    gate.resolve()
    await tick(10)
  })

  it('scan_processing_finished ocorre no máximo uma vez por scanId (sucesso)', async () => {
    const emitTelemetry = vi.fn()
    const c = createScanPipelineController({ maxQueueDepth: 10 }, async () => ({ ok: true }), {
      telemetry: { emitTelemetry },
    })
    const r = c.enqueue('sku-1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const scanId = r.scanId
    await waitUntil(() =>
      emitTelemetry.mock.calls.some(
        (call) => call[0].event === 'scan_processing_finished' && call[0].scanId === scanId,
      ),
    )
    const finishes = emitTelemetry.mock.calls.filter(
      (call) => call[0].event === 'scan_processing_finished' && call[0].scanId === scanId,
    )
    expect(finishes).toHaveLength(1)
  })

  it('scan_processing_aborted ocorre no máximo uma vez por scanId (shutdown)', async () => {
    const emitTelemetry = vi.fn()
    const gate = defer<void>()
    const handler: ScanPipelineHandler = async ({ signal }) => {
      await Promise.race([
        gate.promise,
        new Promise<void>((r) => signal?.addEventListener('abort', () => r(), { once: true })),
      ])
      if (signal?.aborted) return { ok: false, reason: 'aborted' }
      return { ok: true }
    }
    const c = createScanPipelineController({ maxQueueDepth: 10 }, handler, {
      telemetry: { emitTelemetry },
    })
    const r = c.enqueue('x')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const scanId = r.scanId
    await waitForCurrentScanState(c, 'processing')
    c.shutdown()
    await waitUntil(() =>
      emitTelemetry.mock.calls.some(
        (call) => call[0].event === 'scan_processing_aborted' && call[0].scanId === scanId,
      ),
    )
    const aborted = emitTelemetry.mock.calls.filter(
      (call) => call[0].event === 'scan_processing_aborted' && call[0].scanId === scanId,
    )
    expect(aborted).toHaveLength(1)
    gate.resolve()
    await tick(10)
  })
})
