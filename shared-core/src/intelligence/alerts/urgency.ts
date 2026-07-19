import type { AlertUrgency } from '../contracts/alert'
import type { Recommendation } from '../contracts/recommendation'
import type { UrgencyTier } from '../types/common'
import type { SeverityPlan } from './types'

const TIER_SCORE: Record<UrgencyTier, number> = {
  P0: 90,
  P1: 70,
  P2: 40,
  P3: 20,
}

/**
 * Urgency a partir do tier da Recommendation — não altera confidence.
 *
 * DÍVIDA ARQUITETURAL (não bug): C5 usa só Rec priority.
 * Alvo: Impacto + Tempo + Persistência + Contexto — ver
 * DECISION_INTELLIGENCE_CYCLE_5.md § Dívida arquitetural conhecida.
 */
export function computeAlertUrgency(rec: Recommendation): AlertUrgency {
  return {
    score: TIER_SCORE[rec.urgency],
    reason: `intel.alert.urgency.from_tier.${rec.urgency}`,
  }
}

/**
 * Severity + justificativa a partir da urgency tier da Rec.
 * Independente de operationalConfidence.
 */
export function planSeverityFromRecommendation(
  rec: Recommendation,
): SeverityPlan {
  if (rec.urgency === 'P0') {
    return {
      severity: 'CRITICAL',
      justificationCode: `intel.alert.severity.critical.from_${rec.recommendationCode}`,
    }
  }
  if (rec.urgency === 'P1' || rec.urgency === 'P2') {
    return {
      severity: 'WARNING',
      justificationCode: `intel.alert.severity.warning.from_${rec.recommendationCode}`,
    }
  }
  return {
    severity: 'INFO',
    justificationCode: `intel.alert.severity.info.from_${rec.recommendationCode}`,
  }
}
