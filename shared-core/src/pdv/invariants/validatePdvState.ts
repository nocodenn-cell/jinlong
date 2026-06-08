import { applyAssertEscalation } from './applyAssertEscalation'
import { applyModeViolations } from './applyModeViolations'
import { computeSeveritySummary } from './computeSeveritySummary'
import { detectInvariants } from './detectInvariants'
import { detectModeViolations } from './detectModeViolations'
import type { PdvStateSnapshot, PdvValidationResult, ValidatePdvStateOptions } from './types'

export function validatePdvState(
  snapshot: PdvStateSnapshot,
  options: ValidatePdvStateOptions,
): PdvValidationResult {
  const invariantViolations = detectInvariants(snapshot)
  const modeViolations = detectModeViolations(snapshot)
  const withMode = applyModeViolations([...invariantViolations, ...modeViolations], options.mode)
  const violations = applyAssertEscalation(withMode, options.invariantAssert)
  const ok = !violations.some((v) => v.severity === 'error')

  return {
    ok,
    mode: options.mode,
    context: options.context,
    invariantAssert: options.invariantAssert,
    violations,
    meta: {
      severitySummary: computeSeveritySummary(violations),
    },
  }
}
