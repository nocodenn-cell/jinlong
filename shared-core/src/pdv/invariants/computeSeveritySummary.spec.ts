import { describe, expect, it } from 'vitest'
import { computeSeveritySummary } from './computeSeveritySummary'
import type { PdvViolation } from './types'

const warning: PdvViolation = {
  code: 'TEST_WARN',
  message: 'test warning',
  severity: 'warning',
  layer: 'mode',
}

const error: PdvViolation = {
  code: 'TEST_ERR',
  message: 'test error',
  severity: 'error',
  layer: 'invariant',
}

describe('computeSeveritySummary', () => {
  it('returns all-ok for empty violations', () => {
    expect(computeSeveritySummary([])).toBe('all-ok')
  })

  it('returns warnings when only warnings present', () => {
    expect(computeSeveritySummary([warning])).toBe('warnings')
  })

  it('returns errors when any error present', () => {
    expect(computeSeveritySummary([warning, error])).toBe('errors')
  })

  it('returns errors for errors-only list', () => {
    expect(computeSeveritySummary([error])).toBe('errors')
  })
})
