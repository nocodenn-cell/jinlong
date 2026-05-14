/**
 * Testes unitários do enforcement de transições (sem passar pelo runner completo).
 */
import { describe, expect, it, vi } from 'vitest'
import {
  applyScanProcessingCompletion,
  isAllowedScanStateTransition,
  transitionDiscardedQueuedScanToCancelled,
  transitionQueuedScanToProcessing,
} from './scan-pipeline-transitions'
import { buildScanTimeline } from './scan-pipeline-timeline'
import type { HumanTelemetryPayloadInput, QueuedScan } from './scan-pipeline'

function baseScan(overrides: Partial<QueuedScan> = {}): QueuedScan {
  return {
    sequenceNumber: 1,
    event: { id: 'scan-test-1', codigo: 'sku', receivedAt: 1000 },
    state: 'queued',
    stage: 'ingress',
    timestamps: { enqueuedAt: 1000 },
    attempts: 0,
    ...overrides,
  }
}

describe('scan-pipeline-transitions', () => {
  it('isAllowedScanStateTransition: pending_resolution não tem transições ativas no motor', () => {
    expect(isAllowedScanStateTransition('pending_resolution', 'acknowledged')).toBe(false)
    expect(isAllowedScanStateTransition('queued', 'processing')).toBe(true)
    expect(isAllowedScanStateTransition('processing', 'failed')).toBe(true)
  })

  it('transitionDiscardedQueuedScanToCancelled exige queued', () => {
    const scan = baseScan({ state: 'processing' })
    expect(() => transitionDiscardedQueuedScanToCancelled(scan, 2000)).toThrow(/flush só cancela/)
  })

  it('transitionQueuedScanToProcessing exige queued', () => {
    const scan = baseScan({ state: 'processing' })
    expect(() => transitionQueuedScanToProcessing(scan, 2000)).toThrow(/runner só desloca/)
  })

  it('applyScanProcessingCompletion: double finalize se estado ≠ processing', () => {
    const scan = baseScan({ state: 'acknowledged' })
    const emit = vi.fn()
    const r = applyScanProcessingCompletion(scan, { ok: true }, { t0: 1000, t1: 2000, queueDepth: 0 }, emit)
    expect(r).toEqual({ ok: false, reason: 'double_finalize' })
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ event: 'double_finalize_attempt' }), scan)
  })

  it('applyScanProcessingCompletion: sucesso emite finished e acknowledged', () => {
    const scan = baseScan({ state: 'processing' })
    const events: HumanTelemetryPayloadInput[] = []
    const emit = vi.fn((p: HumanTelemetryPayloadInput) => {
      events.push(p)
    })
    const r = applyScanProcessingCompletion(scan, { ok: true }, { t0: 1000, t1: 1500, queueDepth: 0 }, emit)
    expect(r).toEqual({ ok: true })
    expect(scan.state).toBe('acknowledged')
    expect(scan.timestamps.acknowledgedAt).toBe(1500)
    const timeline = buildScanTimeline(events, 'scan-test-1')
    const names = timeline.map((row) => row.event)
    expect(names.indexOf('scan_processing_finished')).toBeLessThan(names.indexOf('scan_total_duration_ms'))
  })
})
