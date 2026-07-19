import type {
  DecisionRecord,
  DecisionRecordCreateInput,
  DecisionRecordOutcomePatch,
} from '../models/decision-record'

export type DecisionRecordSaveResult =
  | { ok: true; id: string }
  | { ok: false; code: string; message: string }

/**
 * Porta DecisionRecord — fora do Core.
 * Adapter só persiste; não avalia recomendação nem outcomes.
 */
export type DecisionRecordRepositoryPort = {
  create(input: DecisionRecordCreateInput): Promise<DecisionRecordSaveResult>
  updateOutcomes(
    id: string,
    patch: DecisionRecordOutcomePatch,
  ): Promise<DecisionRecordSaveResult>
  findById(id: string): Promise<DecisionRecord | null>
  findByRecommendationId(
    recommendationId: string,
  ): Promise<readonly DecisionRecord[]>
  listByLoja(lojaId: string, limit?: number): Promise<readonly DecisionRecord[]>
}
