import type {
  RecommendationEngineInput,
  RecommendationEnginePort,
} from '../contracts/recommendation-purity'
import type { Recommendation } from '../contracts/recommendation'
import { assertRecommendationDeterminism } from './determinism'
import { RECOMMENDATION_RULES } from './recommendation-registry'
import type {
  RecommendationEngineSyncInput,
  RecommendationRuleContext,
  RecommendationSnapshot,
} from './types'

/**
 * Recommendation Engine — puro.
 * Findings → opções de revisão. Sem I/O. Sem decisões operacionais.
 */
export function runRecommendationEngine(
  input: RecommendationEngineSyncInput,
): RecommendationSnapshot {
  const recommendations: Recommendation[] = []
  let skippedByPolicy = 0

  for (const finding of input.findings) {
    for (const rule of RECOMMENDATION_RULES) {
      if (!rule.basedOnFindingIds.includes(finding.id)) continue

      const ctx: RecommendationRuleContext = {
        storeId: input.storeId,
        requestedAt: input.requestedAt,
        finding,
        derivedKpis: input.derivedKpis,
      }
      const result = rule.evaluate(ctx)
      if (result === 'SKIP_POLICY') {
        skippedByPolicy += 1
        continue
      }
      if (result === null) continue

      assertRecommendationDeterminism(result)
      recommendations.push(result)
    }
  }

  return {
    storeId: input.storeId,
    emittedAt: input.requestedAt,
    recommendations,
    findingsConsidered: input.findings.length,
    skippedByPolicy,
  }
}

/** Adapter async para o Engine Loop (port). */
export function createRecommendationEngine(): RecommendationEnginePort {
  return {
    async evaluate(
      input: RecommendationEngineInput,
    ): Promise<readonly Recommendation[]> {
      const snapshot = runRecommendationEngine({
        storeId: input.storeId,
        requestedAt: input.requestedAt,
        findings: input.findings,
        derivedKpis: input.derivedKpis ?? [],
      })
      return snapshot.recommendations
    },
  }
}
