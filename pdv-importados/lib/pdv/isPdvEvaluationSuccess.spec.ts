import { describe, expect, it } from 'vitest'
import { PDVContext } from '../../../shared-core/src/pdv/invariants'
import { isPdvEvaluationSuccess } from './isPdvEvaluationSuccess'

describe('isPdvEvaluationSuccess', () => {
  it('false para fetch_failed', () => {
    expect(
      isPdvEvaluationSuccess({
        kind: 'fetch_failed',
        code: 'CAIXA_NOT_FOUND',
        message: 'x',
      }),
    ).toBe(false)
  })

  it('true apenas quando validated e ok', () => {
    expect(
      isPdvEvaluationSuccess({
        kind: 'validated',
        validation: {
          ok: true,
          mode: 'strict',
          context: PDVContext.DEMO_FLOW,
          invariantAssert: false,
          violations: [],
          meta: { severitySummary: 'all-ok' },
        },
      }),
    ).toBe(true)

    expect(
      isPdvEvaluationSuccess({
        kind: 'validated',
        validation: {
          ok: false,
          mode: 'strict',
          context: PDVContext.DEMO_FLOW,
          invariantAssert: false,
          violations: [
            {
              code: 'X',
              message: 'y',
              severity: 'error',
              layer: 'invariant',
            },
          ],
          meta: { severitySummary: 'errors' },
        },
      }),
    ).toBe(false)
  })
})
