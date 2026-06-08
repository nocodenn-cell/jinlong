'use server'

import { validatePdvState } from '../../../shared-core/src/pdv/invariants'
import type { PDVContext } from '../../../shared-core/src/pdv/invariants'
import { fetchPdvStateSnapshot } from './fetchPdvStateSnapshot.internal'
import { resolvePdvEvaluationOptions } from './resolvePdvEvaluationOptions'
import type { PdvEvaluationOutcome } from './types'

export async function runPdvEvaluation(
  caixaId: string,
  context: PDVContext,
): Promise<PdvEvaluationOutcome> {
  const options = resolvePdvEvaluationOptions(context)
  const snapshot = await fetchPdvStateSnapshot(caixaId)

  if (!snapshot) {
    return {
      kind: 'fetch_failed',
      code: 'CAIXA_NOT_FOUND',
      message: `Caixa ${caixaId} indisponível para avaliação.`,
    }
  }

  return {
    kind: 'validated',
    validation: validatePdvState(snapshot, options),
  }
}
