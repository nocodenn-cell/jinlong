import {
  PDVContext,
  type PDVContext as PDVContextType,
  type ValidatePdvStateOptions,
} from '../../../shared-core/src/pdv/invariants'

export function resolvePdvEvaluationOptions(context: PDVContextType): ValidatePdvStateOptions {
  const mode =
    context === PDVContext.DEMO_FLOW || context === PDVContext.TEST
      ? 'strict'
      : 'observational'

  return {
    mode,
    context,
    invariantAssert: process.env.PDV_INVARIANT_ASSERT === '1',
  }
}
