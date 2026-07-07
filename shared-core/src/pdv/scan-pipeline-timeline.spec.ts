import { describe, expect, it } from 'vitest'
import type { HumanTelemetryScanEvent, ScanFailureReason } from './scan-pipeline'
import { buildScanTimeline } from './scan-pipeline-timeline'

type TimelineInput = {
  at: number
  event: HumanTelemetryScanEvent
  scanId: string
  sequenceNumber?: number
  durationMs?: number
  reason?: ScanFailureReason
}

describe('buildScanTimeline', () => {
  it('filters events by scanId', () => {
    const events: TimelineInput[] = [
      { at: 1, event: 'scan_received', scanId: 'a' },
      { at: 2, event: 'buscar_produto_duration_ms', scanId: 'b' },
      { at: 3, event: 'scan_processing_finished', scanId: 'a' },
    ]
    const timeline = buildScanTimeline(events, 'a')
    expect(timeline).toHaveLength(2)
    expect(timeline.every((r) => r.scanId === 'a')).toBe(true)
  })

  it('sorts by ascending "at" timestamp', () => {
    const events: TimelineInput[] = [
      { at: 3, event: 'scan_processing_finished', scanId: 'x' },
      { at: 1, event: 'scan_received', scanId: 'x' },
      { at: 2, event: 'scan_processing_started', scanId: 'x' },
    ]
    const timeline = buildScanTimeline(events, 'x')
    expect(timeline.map((r) => r.at)).toEqual([1, 2, 3])
  })

  it('includes optional fields when present', () => {
    const events: TimelineInput[] = [
      {
        at: 1,
        event: 'scan_received',
        scanId: 's1',
        sequenceNumber: 0,
        durationMs: 50,
        reason: 'unknown',
      },
    ]
    const [row] = buildScanTimeline(events, 's1')
    expect(row.sequenceNumber).toBe(0)
    expect(row.durationMs).toBe(50)
    expect(row.reason).toBe('unknown')
  })

  it('omits optional fields when absent', () => {
    const events: TimelineInput[] = [{ at: 1, event: 'scan_queue_depth', scanId: 'p' }]
    const [row] = buildScanTimeline(events, 'p')
    expect(row).not.toHaveProperty('sequenceNumber')
    expect(row).not.toHaveProperty('durationMs')
    expect(row).not.toHaveProperty('reason')
  })

  it('returns empty array for no matching scanId', () => {
    const events: TimelineInput[] = [{ at: 1, event: 'scan_received', scanId: 'a' }]
    expect(buildScanTimeline(events, 'z')).toEqual([])
  })
})
