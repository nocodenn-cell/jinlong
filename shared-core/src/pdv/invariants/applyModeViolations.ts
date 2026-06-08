import type { PdvValidationMode, PdvViolation } from './types'

export function applyModeViolations(
  violations: PdvViolation[],
  mode: PdvValidationMode,
): PdvViolation[] {
  return violations.map((v) => {
    if (v.layer === 'invariant') return v
    return {
      ...v,
      severity: mode === 'strict' ? 'error' : 'warning',
    }
  })
}
