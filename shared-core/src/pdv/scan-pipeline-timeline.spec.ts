import { describe, expect, it } from 'vitest'
import { buildScanTimeline } from './scan-pipeline-timeline'

describe('buildScanTimeline', () => {
  it('filters events by scanId', () => {
    const events = [
      { at: 1, event: 'start', scanId: 'a' },
      { at: 2, event: 'lookup', scanId: 'b' },
      { at: 3, event: 'end', scanId: 'a' },
    ]
    const timeline = buildScanTimeline(events, 'a')
    expect(timeline).toHaveLength(2)
    expect(timeline.every((r) => r.scanId === 'a')).toBe(true)
  })

  it('sorts by ascending "at" timestamp', () => {
    const events = [
      { at: 3, event: 'end', scanId: 'x' },
      { at: 1, event: 'start', scanId: 'x' },
      { at: 2, event: 'middle', scanId: 'x' },
    ]
    const timeline = buildScanTimeline(events, 'x')
    expect(timeline.map((r) => r.at)).toEqual([1, 2, 3])
  })

  it('includes optional fields when present', () => {
    const events = [
      { at: 1, event: 'start', scanId: 's1', sequenceNumber: 0, durationMs: 50, reason: 'init' },
    ]
    const [row] = buildScanTimeline(events, 's1')
    expect(row.sequenceNumber).toBe(0)
    expect(row.durationMs).toBe(50)
    expect(row.reason).toBe('init')
  })

  it('omits optional fields when absent', () => {
    const events = [{ at: 1, event: 'ping', scanId: 'p' }]
    const [row] = buildScanTimeline(events, 'p')
    expect(row).not.toHaveProperty('sequenceNumber')
    expect(row).not.toHaveProperty('durationMs')
    expect(row).not.toHaveProperty('reason')
  })

  it('returns empty array for no matching scanId', () => {
    const events = [{ at: 1, event: 'start', scanId: 'a' }]
    expect(buildScanTimeline(events, 'z')).toEqual([])
  })
})
