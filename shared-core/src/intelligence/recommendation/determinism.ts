import type { Recommendation } from '../contracts/recommendation'
import { isForbiddenOperationalAction } from '../policy/recommendation-policy'

/**
 * Recommendation Determinism Gate (Cycle 4).
 * Sem Finding / KPI / regra / confidence → não entra.
 */
export function assertRecommendationDeterminism(rec: Recommendation): void {
  if (rec.sourceFindingIds.length === 0) {
    throw new Error(`INTEL_REC_NO_FINDING:${rec.id}`)
  }
  if (rec.kpisUsed.length === 0) {
    throw new Error(`INTEL_REC_NO_KPI:${rec.id}`)
  }
  if (!rec.ruleId || !rec.ruleVersion) {
    throw new Error(`INTEL_REC_NO_RULE:${rec.id}`)
  }
  if (
    typeof rec.operationalConfidence !== 'number' ||
    rec.operationalConfidence < 0 ||
    rec.operationalConfidence > 1
  ) {
    throw new Error(`INTEL_REC_BAD_CONFIDENCE:${rec.id}`)
  }
  if (!rec.recommendationCode) {
    throw new Error(`INTEL_REC_NO_CODE:${rec.id}`)
  }
  if (rec.evidences.length === 0) {
    throw new Error(`INTEL_REC_NO_EVIDENCE:${rec.id}`)
  }
  if (isForbiddenOperationalAction(rec.recommendedAction.actionCode)) {
    throw new Error(`INTEL_REC_FORBIDDEN_ACTION:${rec.recommendedAction.actionCode}`)
  }
  if (isForbiddenOperationalAction(rec.recommendationCode)) {
    throw new Error(`INTEL_REC_FORBIDDEN_CODE:${rec.recommendationCode}`)
  }
}
