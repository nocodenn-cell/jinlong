import type {
  RecommendationEngineInput,
  RecommendationEnginePort,
} from '../contracts/recommendation-purity'
import type { Recommendation } from '../contracts/recommendation'

/**
 * Recommendation Engine stub (Cycle 1).
 * Infraestrutura apenas — lista vazia.
 * Nunca faz I/O; só lê o input tipado (Facts).
 */
export function createRecommendationEngineStub(): RecommendationEnginePort {
  return {
    async evaluate(_input: RecommendationEngineInput): Promise<readonly Recommendation[]> {
      return []
    },
  }
}

/** Garante que nenhum Fact bloqueado chegou ao engine (invariante de teste/pipeline). */
export function assertRecommendationInputPurity(input: RecommendationEngineInput): void {
  for (const fact of input.facts) {
    if (fact.confidence === 'UNSUPPORTED' || fact.operationalConfidence <= 0) {
      throw new Error(`INTEL_REC_IMPURE_FACT:${fact.factId}`)
    }
  }
}
