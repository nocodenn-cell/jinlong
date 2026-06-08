import { describe, expect, it } from 'vitest'
import { applyModeViolations } from './applyModeViolations'
import { modeViolation } from './testHelpers'

describe('applyModeViolations — observational', () => {
  it('mantém violations de mode como warning', () => {
    const result = applyModeViolations([modeViolation()], 'observational')
    expect(result[0]?.severity).toBe('warning')
  })

  it('não altera violations invariant', () => {
    const invariant = {
      code: 'FECHAMENTO_INVALIDO',
      message: 'x',
      severity: 'error' as const,
      layer: 'invariant' as const,
    }
    const result = applyModeViolations([invariant], 'observational')
    expect(result[0]?.severity).toBe('error')
  })
})
