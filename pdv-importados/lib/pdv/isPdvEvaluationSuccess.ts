import type { PdvEvaluationOutcome } from './types'

export function isPdvEvaluationSuccess(outcome: PdvEvaluationOutcome): boolean {
  return outcome.kind === 'validated' && outcome.validation.ok
}
