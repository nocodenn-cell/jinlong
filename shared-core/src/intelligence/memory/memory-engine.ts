import type { ActionPlan } from '../contracts/action-plan'
import type { Alert } from '../contracts/alert'
import type { MemoryEntry, MemorySnapshot } from '../contracts/memory-snapshot'
import type { Recommendation } from '../contracts/recommendation'
import { assertMemoryDeterminism } from './determinism'
import type { MemoryEngineInput } from './types'

const RULE_ID = 'MEMORY_PIPELINE_EMISSION'
const RULE_VERSION = '1.0.0'

function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort()
}

function minConfidence(values: readonly number[]): number {
  if (values.length === 0) return 0
  return Math.min(...values)
}

function buildFingerprint(input: MemoryEngineInput): string {
  const parts = [
    input.storeId,
    input.requestedAt,
    `f:${input.findings.length}`,
    `r:${input.recommendations.length}`,
    `a:${input.alerts.length}`,
    `p:${input.actionPlans.length}`,
    `c:${input.confidenceSummary.averageOperationalConfidence}`,
  ]
  return parts.join('|')
}

function alertsForRec(
  alerts: readonly Alert[],
  recommendationId: string,
): Alert[] {
  return alerts.filter((a) =>
    a.sourceRecommendationIds.includes(recommendationId),
  )
}

function plansForRec(
  plans: readonly ActionPlan[],
  recommendationId: string,
): ActionPlan[] {
  return plans.filter((p) =>
    p.sourceRecommendationIds.includes(recommendationId),
  )
}

function entryForRecommendation(rec: Recommendation, input: MemoryEngineInput): MemoryEntry {
  const relatedAlerts = alertsForRec(input.alerts, rec.id)
  const relatedPlans = plansForRec(input.actionPlans, rec.id)
  return {
    id: `mem:emission:rec:${rec.id}`,
    kind: 'EMISSION',
    code: 'intel.memory.emission.recommendation',
    relatedFindingIds: [...rec.sourceFindingIds],
    relatedRecommendationIds: [rec.id],
    relatedAlertIds: relatedAlerts.map((a) => a.id),
    relatedActionPlanIds: relatedPlans.map((p) => p.id),
    noteCodes: [
      `intel.memory.note.rec.${rec.recommendationCode.toLowerCase()}`,
    ],
    operationalConfidence: rec.operationalConfidence,
  }
}

function entryForActionPlan(plan: ActionPlan): MemoryEntry {
  return {
    id: `mem:emission:plan:${plan.id}`,
    kind: 'EMISSION',
    code: 'intel.memory.emission.action_plan',
    relatedFindingIds: [...plan.sourceFindingIds],
    relatedRecommendationIds: [...plan.sourceRecommendationIds],
    relatedAlertIds: [...plan.sourceAlertIds],
    relatedActionPlanIds: [plan.id],
    noteCodes: [
      `intel.memory.note.objective.${plan.objectiveCode.toLowerCase()}`,
    ],
    operationalConfidence: plan.operationalConfidence,
  }
}

function entryForCriticalAlert(alert: Alert): MemoryEntry {
  return {
    id: `mem:hint:critical:${alert.id}`,
    kind: 'LEARNING_HINT',
    code: 'intel.memory.hint.critical_alert',
    relatedFindingIds: [...alert.sourceFindingIds],
    relatedRecommendationIds: [...alert.sourceRecommendationIds],
    relatedAlertIds: [alert.id],
    relatedActionPlanIds: [],
    noteCodes: ['intel.memory.hint.review_effectiveness_later'],
    operationalConfidence: alert.operationalConfidence,
  }
}

/**
 * Memory Engine — puro.
 * Entries granulares: só artefatos do evento. Sem banco. Sem mutar pipeline.
 */
export function runMemoryEngine(input: MemoryEngineInput): MemorySnapshot {
  const sourceFindingIds = uniqueSorted(input.findings.map((f) => f.id))
  const sourceRecommendationIds = uniqueSorted(
    input.recommendations.map((r) => r.id),
  )
  const sourceAlertIds = uniqueSorted(input.alerts.map((a) => a.id))
  const sourceActionPlanIds = uniqueSorted(input.actionPlans.map((p) => p.id))

  const confidences = [
    ...input.findings.map((f) => f.operationalConfidence),
    ...input.recommendations.map((r) => r.operationalConfidence),
    ...input.alerts.map((a) => a.operationalConfidence),
    ...input.actionPlans.map((p) => p.operationalConfidence),
  ]
  const operationalConfidence = minConfidence(confidences)

  const entries: MemoryEntry[] = []

  for (const rec of input.recommendations) {
    entries.push(entryForRecommendation(rec, input))
  }
  for (const plan of input.actionPlans) {
    entries.push(entryForActionPlan(plan))
  }
  for (const alert of input.alerts) {
    if (alert.severity === 'CRITICAL') {
      entries.push(entryForCriticalAlert(alert))
    }
  }

  /** Contexto do ciclo — sem anexar todos os artefatos (só metadado). */
  entries.push({
    id: `mem:context:${input.requestedAt}`,
    kind: 'CONTEXT',
    code: 'intel.memory.context.confidence_summary',
    relatedFindingIds: [],
    relatedRecommendationIds: [],
    relatedAlertIds: [],
    relatedActionPlanIds: [],
    noteCodes: [
      input.confidenceSummary.messageCode,
      'intel.memory.note.no_prior_decision_mutated',
      `intel.memory.note.counts.f${input.findings.length}.r${input.recommendations.length}.a${input.alerts.length}.p${input.actionPlans.length}`,
    ],
    operationalConfidence: Math.min(
      operationalConfidence || 0,
      input.confidenceSummary.averageOperationalConfidence || 0,
    ),
  })

  const snapshot: MemorySnapshot = {
    storeId: input.storeId,
    recordedAt: input.requestedAt,
    ruleId: RULE_ID,
    ruleVersion: RULE_VERSION,
    entries,
    pipelineFingerprint: buildFingerprint(input),
    operationalConfidence,
    sourceFindingIds,
    sourceRecommendationIds,
    sourceAlertIds,
    sourceActionPlanIds,
  }

  assertMemoryDeterminism(snapshot)
  return snapshot
}
