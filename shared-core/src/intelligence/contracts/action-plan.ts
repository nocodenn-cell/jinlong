import type {
  ConfidenceLevel,
  MoneyAmount,
  OperationalConfidence,
  UrgencyTier,
} from '../types/common'

/**
 * Action Plan Contract — ADR-011 + Cycle 6 + hardening v1.0.
 * Organiza trabalho agregado por objetivo — não executa operações.
 */

export type ActionPlanItemStatus = 'TODO' | 'DONE' | 'SKIPPED' | 'DEFERRED'

export type ActionPlanItem = {
  id: string
  recommendationId: string
  titleCode: string
  /** Só revisão / validação / conferência — nunca mutação. */
  actionCode: string
  checklistLabelCode: string
  urgency: UrgencyTier
  confidence: ConfidenceLevel
  operationalConfidence: OperationalConfidence
  /** Findings que originaram o item (via Recommendation). */
  sourceFindingIds: readonly string[]
  /** Alerts que referenciam a Recommendation deste item. */
  sourceAlertIds: readonly string[]
  estimatedImpact?: MoneyAmount
  deepLinkHint?: string
  status: ActionPlanItemStatus
  completedAt?: string
  actorId?: string
}

export type ActionPlan = {
  id: string
  storeId: string
  planDate: string
  objectiveCode: string
  items: readonly ActionPlanItem[]
  createdAt: string
  sourceAlertIds: readonly string[]
  sourceRecommendationIds: readonly string[]
  sourceFindingIds: readonly string[]
  operationalConfidence: OperationalConfidence
  urgency: UrgencyTier
  ruleId: string
  ruleVersion: string
}
