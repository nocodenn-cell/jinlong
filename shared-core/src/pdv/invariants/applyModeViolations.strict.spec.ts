import { describe, expect, it } from 'vitest'
import { applyModeViolations } from './applyModeViolations'
import { modeViolation } from './testHelpers'

describe('applyModeViolations — strict', () => {
  it('promove violations de mode para error', () => {
    const result = applyModeViolations([modeViolation()], 'strict')
    expect(result[0]?.severity).toBe('error')
  })

  it('não altera violations invariant', () => {
    const invariant = {
      code: 'CAIXA_INCONSISTENT',
      message: 'x',
      severity: 'error' as const,
      layer: 'invariant' as const,
    }
    const result = applyModeViolations([invariant, modeViolation()], 'strict')
    expect(result[0]).toEqual(invariant)
    expect(result[1]?.severity).toBe('error')
  })
})
