import type { PdvValidationResult } from '../../../shared-core/src/pdv/invariants'

export type PdvFetchFailureCode =
  | 'CAIXA_NOT_FOUND'
  | 'CAIXA_VERSION_MISSING'
  | 'SNAPSHOT_INCOMPLETE'

export type PdvEvaluationOutcome =
  | {
      kind: 'validated'
      validation: PdvValidationResult
    }
  | {
      kind: 'fetch_failed'
      code: PdvFetchFailureCode
      message: string
    }
