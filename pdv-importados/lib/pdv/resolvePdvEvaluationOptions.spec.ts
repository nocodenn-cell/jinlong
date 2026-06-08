import { afterEach, describe, expect, it } from 'vitest'
import { PDVContext } from '../../../shared-core/src/pdv/invariants'
import { resolvePdvEvaluationOptions } from './resolvePdvEvaluationOptions'

describe('resolvePdvEvaluationOptions', () => {
  const prev = process.env.PDV_INVARIANT_ASSERT

  afterEach(() => {
    if (prev === undefined) delete process.env.PDV_INVARIANT_ASSERT
    else process.env.PDV_INVARIANT_ASSERT = prev
  })

  it('DEMO_FLOW → strict', () => {
    expect(resolvePdvEvaluationOptions(PDVContext.DEMO_FLOW).mode).toBe('strict')
  })

  it('TEST → strict', () => {
    expect(resolvePdvEvaluationOptions(PDVContext.TEST).mode).toBe('strict')
  })

  it('CAIXA_CLOSE → observational', () => {
    expect(resolvePdvEvaluationOptions(PDVContext.CAIXA_CLOSE).mode).toBe('observational')
  })

  it('PDV_INVARIANT_ASSERT passa invariantAssert', () => {
    process.env.PDV_INVARIANT_ASSERT = '1'
    expect(resolvePdvEvaluationOptions(PDVContext.CAIXA_CLOSE).invariantAssert).toBe(true)
  })
})
