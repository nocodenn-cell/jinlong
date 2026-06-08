import { describe, expect, it } from 'vitest'
import { applyAssertEscalation } from './applyAssertEscalation'
import { modeViolation } from './testHelpers'

describe('applyAssertEscalation', () => {
  it('sem assert mantém warnings', () => {
    const result = applyAssertEscalation([modeViolation()], false)
    expect(result[0]?.severity).toBe('warning')
  })

  it('com assert promove warning para error', () => {
    const result = applyAssertEscalation([modeViolation()], true)
    expect(result[0]?.severity).toBe('error')
  })

  it('não altera invariants', () => {
    const invariant = {
      code: 'CAIXA_INCONSISTENT',
      message: 'x',
      severity: 'error' as const,
      layer: 'invariant' as const,
    }
    const result = applyAssertEscalation([invariant, modeViolation()], true)
    expect(result[0]).toEqual(invariant)
    expect(result[1]?.severity).toBe('error')
  })
})
