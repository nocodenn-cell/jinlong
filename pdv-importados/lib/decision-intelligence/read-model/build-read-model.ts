import type { DecisionSnapshot } from '@shared-core/src/intelligence'
import type { DecisionRecord } from '../models/decision-record'
import type {
  CriticalAlertsProjection,
  DailyActionPlanProjection,
  DecisionHistoryProjection,
  DecisionIntelligenceReadModel,
  DecisionPerformanceProjection,
  ExecutiveDashboardProjection,
  PendingReviewsProjection,
  RecommendationQueueProjection,
} from './models'

export type BuildReadModelInput = {
  snapshot: DecisionSnapshot | null
  records: readonly DecisionRecord[]
  /** Versão do snapshot persistido (meta), se houver. */
  snapshotVersion?: string | null
  projectedAt?: string
}

function countByStatus(records: readonly DecisionRecord[]) {
  const counts = {
    accepted: 0,
    rejected: 0,
    deferred: 0,
    executed: 0,
    total: records.length,
  }
  for (const r of records) {
    if (r.status === 'accepted') counts.accepted += 1
    else if (r.status === 'rejected') counts.rejected += 1
    else if (r.status === 'deferred') counts.deferred += 1
    else if (r.status === 'executed') counts.executed += 1
  }
  return counts
}

function latestRecordByRecommendation(
  records: readonly DecisionRecord[],
): Map<string, DecisionRecord> {
  const map = new Map<string, DecisionRecord>()
  const sorted = [...records].sort((a, b) =>
    b.decisionAt.localeCompare(a.decisionAt),
  )
  for (const r of sorted) {
    if (!map.has(r.recommendationId)) map.set(r.recommendationId, r)
  }
  return map
}

function projectExecutive(
  snapshot: DecisionSnapshot | null,
  records: readonly DecisionRecord[],
  snapshotVersion: string | null,
): ExecutiveDashboardProjection {
  const exec = snapshot?.executive
  const storeId = snapshot?.storeId ?? records[0]?.lojaId ?? ''
  return {
    storeId,
    composedAt: exec?.composedAt ?? snapshot?.timestamp ?? '',
    headlineCodes: exec?.headlineCodes ?? [],
    operationalConfidence: exec?.operationalConfidence ?? 0,
    kpiSummary: {
      supported: exec?.kpiSummary.supported ?? 0,
      partial: exec?.kpiSummary.partial ?? 0,
      blocked: exec?.kpiSummary.blocked ?? 0,
      highlightKpiIds: exec?.kpiSummary.highlightKpiIds ?? [],
    },
    findingSummary: {
      count: exec?.findingSummary.count ?? 0,
      critical: exec?.findingSummary.critical ?? 0,
      warning: exec?.findingSummary.warning ?? 0,
      info: exec?.findingSummary.info ?? 0,
    },
    alertSummary: {
      count: exec?.alertSummary.count ?? 0,
      critical: exec?.alertSummary.critical ?? 0,
      warning: exec?.alertSummary.warning ?? 0,
      info: exec?.alertSummary.info ?? 0,
    },
    recommendationCount: exec?.recommendationSummary.count ?? snapshot?.recommendations.length ?? 0,
    actionPlanCount: exec?.actionPlanSummary.planCount ?? snapshot?.actionPlans.length ?? 0,
    decisionCounts: countByStatus(records),
    topAlertIds: exec?.topAlertIds ?? [],
    topActionPlanIds: exec?.topActionPlanIds ?? [],
    snapshotVersion,
  }
}

function projectRecommendationQueue(
  snapshot: DecisionSnapshot | null,
  records: readonly DecisionRecord[],
): RecommendationQueueProjection {
  const storeId = snapshot?.storeId ?? ''
  const latest = latestRecordByRecommendation(records)
  const items = (snapshot?.recommendations ?? []).map((rec) => {
    const decision = latest.get(rec.id) ?? null
    return {
      recommendationId: rec.id,
      recommendationCode: rec.recommendationCode,
      problemCode: rec.problemCode,
      urgency: rec.urgency,
      operationalConfidence: rec.operationalConfidence,
      sourceFindingIds: rec.sourceFindingIds,
      deepLinkHint: rec.recommendedAction.deepLinkHint ?? null,
      decisionStatus: decision?.status ?? null,
      latestDecisionId: decision?.id ?? null,
    }
  })
  return {
    storeId,
    items,
    openCount: items.filter((i) => i.decisionStatus === null).length,
    decidedCount: items.filter((i) => i.decisionStatus !== null).length,
  }
}

function projectCriticalAlerts(
  snapshot: DecisionSnapshot | null,
): CriticalAlertsProjection {
  const storeId = snapshot?.storeId ?? ''
  const items = (snapshot?.alerts ?? [])
    .filter((a) => a.severity === 'CRITICAL')
    .map((a) => ({
      alertId: a.id,
      titleCode: a.titleCode,
      severity: 'CRITICAL' as const,
      urgencyScore: a.urgency.score,
      urgencyReason: a.urgency.reason,
      operationalConfidence: a.operationalConfidence,
      sourceRecommendationIds: a.sourceRecommendationIds,
      sourceFindingIds: a.sourceFindingIds,
    }))
  return { storeId, items }
}

function projectDailyActionPlan(
  snapshot: DecisionSnapshot | null,
): DailyActionPlanProjection {
  const storeId = snapshot?.storeId ?? ''
  const plans = (snapshot?.actionPlans ?? []).map((p) => ({
    planId: p.id,
    objectiveCode: p.objectiveCode,
    urgency: p.urgency,
    operationalConfidence: p.operationalConfidence,
    sourceAlertIds: p.sourceAlertIds,
    sourceRecommendationIds: p.sourceRecommendationIds,
    sourceFindingIds: p.sourceFindingIds,
    items: p.items.map((item) => ({
      itemId: item.id,
      recommendationId: item.recommendationId,
      actionCode: item.actionCode,
      titleCode: item.titleCode,
      status: item.status,
      sourceFindingIds: item.sourceFindingIds,
      sourceAlertIds: item.sourceAlertIds,
      deepLinkHint: item.deepLinkHint ?? null,
    })),
  }))
  return {
    storeId,
    planDate: plans[0] ? snapshot?.actionPlans[0]?.planDate ?? null : null,
    plans,
  }
}

function projectDecisionHistory(
  storeId: string,
  records: readonly DecisionRecord[],
): DecisionHistoryProjection {
  const items = [...records]
    .sort((a, b) => b.decisionAt.localeCompare(a.decisionAt))
    .map((r) => ({
      decisionId: r.id,
      recommendationId: r.recommendationId,
      status: r.status,
      decisionReason: r.decisionReason,
      decisionAt: r.decisionAt,
      reviewDate: r.reviewDate,
      expectedOutcome: r.expectedOutcome,
      actualOutcome: r.actualOutcome,
      hasRecordedD30: r.outcomes.d30.status === 'RECORDED',
      hasRecordedD60: r.outcomes.d60.status === 'RECORDED',
      hasRecordedD90: r.outcomes.d90.status === 'RECORDED',
    }))
  return { storeId, items }
}

function projectDecisionPerformance(
  storeId: string,
  records: readonly DecisionRecord[],
): DecisionPerformanceProjection {
  const samples = []
  for (const r of records) {
    const expected = r.expectedOutcome
    const actual = r.actualOutcome
    if (!expected || !actual) continue
    if (expected.metricCode !== actual.metricCode) continue
    samples.push({
      decisionId: r.id,
      recommendationId: r.recommendationId,
      metricCode: expected.metricCode,
      expectedValue: expected.value,
      actualValue: actual.value,
      storedDelta: actual.value - expected.value,
      unit: actual.unit ?? expected.unit ?? null,
    })
  }
  return { storeId, samples, sampleCount: samples.length }
}

function projectPendingReviews(
  snapshot: DecisionSnapshot | null,
  records: readonly DecisionRecord[],
): PendingReviewsProjection {
  const storeId = snapshot?.storeId ?? records[0]?.lojaId ?? ''
  const latest = latestRecordByRecommendation(records)
  const items: PendingReviewsProjection['items'][number][] = []

  for (const rec of snapshot?.recommendations ?? []) {
    if (!latest.has(rec.id)) {
      items.push({
        kind: 'UNDECIDED_RECOMMENDATION',
        recommendationId: rec.id,
        recommendationCode: rec.recommendationCode,
        decisionId: null,
        reviewDate: null,
        decisionReason: null,
      })
    }
  }

  for (const r of records) {
    if (r.status !== 'deferred') continue
    items.push({
      kind: 'DEFERRED_REVIEW',
      recommendationId: r.recommendationId,
      recommendationCode: null,
      decisionId: r.id,
      reviewDate: r.reviewDate,
      decisionReason: r.decisionReason,
    })
  }

  return { storeId, items }
}

/**
 * Builder puro: Snapshot + Records → projeções.
 * Sem I/O. Sem recalcular regras do Core.
 */
export function buildDecisionIntelligenceReadModel(
  input: BuildReadModelInput,
): DecisionIntelligenceReadModel {
  const { snapshot, records } = input
  const storeId = snapshot?.storeId ?? records[0]?.lojaId ?? ''
  const projectedAt = input.projectedAt ?? new Date().toISOString()
  const snapshotVersion = input.snapshotVersion ?? null

  return {
    storeId,
    projectedAt,
    snapshotRequestedAt: snapshot?.timestamp ?? null,
    executiveDashboard: projectExecutive(snapshot, records, snapshotVersion),
    recommendationQueue: projectRecommendationQueue(snapshot, records),
    criticalAlerts: projectCriticalAlerts(snapshot),
    dailyActionPlan: projectDailyActionPlan(snapshot),
    decisionHistory: projectDecisionHistory(storeId, records),
    decisionPerformance: projectDecisionPerformance(storeId, records),
    pendingReviews: projectPendingReviews(snapshot, records),
  }
}
