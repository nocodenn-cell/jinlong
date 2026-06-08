import type { PdvViolation } from './types'

export function applyAssertEscalation(
  violations: PdvViolation[],
  invariantAssert: boolean,
): PdvViolation[] {
  if (!invariantAssert) return violations

  return violations.map((v) => {
    if (v.layer === 'invariant') return v
    if (v.severity === 'warning') {
      return { ...v, severity: 'error' as const }
    }
    return v
  })
}
