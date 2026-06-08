import type { PdvSeveritySummary, PdvViolation } from './types'

export function computeSeveritySummary(violations: PdvViolation[]): PdvSeveritySummary {
  if (violations.length === 0) return 'all-ok'
  if (violations.some((v) => v.severity === 'error')) return 'errors'
  return 'warnings'
}
