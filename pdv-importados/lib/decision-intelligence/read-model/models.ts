import type { DecisionReasonCode, DecisionRecordStatus, MeasurableOutcome } from '../models/decision-record'

/**
 * Projeções de leitura — apenas campos derivados por mapeamento/filtro.
 * Nunca recalculam regras do Core.
 */

export type ExecutiveDashboardProjection = {
  storeId: string
  composedAt: string
  headlineCodes: readonly string[]
  operationalConfidence: number
  kpiSummary: {
    supported: number
    partial: number
    blocked: number
    highlightKpiIds: readonly string[]
  }
  findingSummary: {
    count: number
    critical: number
    warning: number
    info: number
  }
  alertSummary: {
    count: number
    critical: number
    warning: number
    info: number
  }
  recommendationCount: number
  actionPlanCount: number
  /** Contagens a partir de DecisionRecords (já persistidos). */
  decisionCounts: {
    accepted: number
    rejected: number
    deferred: number
    executed: number
    total: number
  }
  topAlertIds: readonly string[]
  topActionPlanIds: readonly string[]
  snapshotVersion: string | null
}

export type RecommendationQueueItem = {
  recommendationId: string
  recommendationCode: string
  problemCode: string
  urgency: string
  operationalConfidence: number
  sourceFindingIds: readonly string[]
  deepLinkHint: string | null
  /** null = ainda sem DecisionRecord. */
  decisionStatus: DecisionRecordStatus | null
  latestDecisionId: string | null
}

export type RecommendationQueueProjection = {
  storeId: string
  items: readonly RecommendationQueueItem[]
  openCount: number
  decidedCount: number
}

export type CriticalAlertItem = {
  alertId: string
  titleCode: string
  severity: 'CRITICAL'
  urgencyScore: number
  urgencyReason: string
  operationalConfidence: number
  sourceRecommendationIds: readonly string[]
  sourceFindingIds: readonly string[]
}

export type CriticalAlertsProjection = {
  storeId: string
  items: readonly CriticalAlertItem[]
}

export type DailyActionPlanItemProjection = {
  itemId: string
  recommendationId: string
  actionCode: string
  titleCode: string
  status: string
  sourceFindingIds: readonly string[]
  sourceAlertIds: readonly string[]
  deepLinkHint: string | null
}

export type DailyActionPlanProjection = {
  storeId: string
  planDate: string | null
  plans: readonly {
    planId: string
    objectiveCode: string
    urgency: string
    operationalConfidence: number
    sourceAlertIds: readonly string[]
    sourceRecommendationIds: readonly string[]
    sourceFindingIds: readonly string[]
    items: readonly DailyActionPlanItemProjection[]
  }[]
}

export type DecisionHistoryItem = {
  decisionId: string
  recommendationId: string
  status: DecisionRecordStatus
  decisionReason: DecisionReasonCode
  decisionAt: string
  reviewDate: string | null
  expectedOutcome: MeasurableOutcome | null
  actualOutcome: MeasurableOutcome | null
  hasRecordedD30: boolean
  hasRecordedD60: boolean
  hasRecordedD90: boolean
}

export type DecisionHistoryProjection = {
  storeId: string
  items: readonly DecisionHistoryItem[]
}

/** Superfície de valores já gravados — não recalcula KPI. */
export type DecisionPerformanceItem = {
  decisionId: string
  recommendationId: string
  metricCode: string
  expectedValue: number
  actualValue: number
  /** actual - expected (aritmética sobre valores persistidos). */
  storedDelta: number
  unit: string | null
}

export type DecisionPerformanceProjection = {
  storeId: string
  samples: readonly DecisionPerformanceItem[]
  sampleCount: number
}

export type PendingReviewItem = {
  kind: 'UNDECIDED_RECOMMENDATION' | 'DEFERRED_REVIEW'
  recommendationId: string
  recommendationCode: string | null
  decisionId: string | null
  reviewDate: string | null
  decisionReason: DecisionReasonCode | null
}

export type PendingReviewsProjection = {
  storeId: string
  items: readonly PendingReviewItem[]
}

export type DecisionIntelligenceReadModel = {
  storeId: string
  projectedAt: string
  snapshotRequestedAt: string | null
  executiveDashboard: ExecutiveDashboardProjection
  recommendationQueue: RecommendationQueueProjection
  criticalAlerts: CriticalAlertsProjection
  dailyActionPlan: DailyActionPlanProjection
  decisionHistory: DecisionHistoryProjection
  decisionPerformance: DecisionPerformanceProjection
  pendingReviews: PendingReviewsProjection
}
