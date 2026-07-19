import type { ActionPlan, ActionPlanItem } from '../contracts/action-plan'
import type { Alert } from '../contracts/alert'
import type { AnalysisFinding } from '../contracts/analysis'
import type { Recommendation } from '../contracts/recommendation'
import type { UrgencyTier } from '../types/common'

const TIER_RANK: Record<UrgencyTier, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
}

function maxUrgency(tiers: readonly UrgencyTier[]): UrgencyTier {
  let best: UrgencyTier = 'P3'
  for (const t of tiers) {
    if (TIER_RANK[t] < TIER_RANK[best]) best = t
  }
  return best
}

function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort()
}

function planDateFromIso(requestedAt: string): string {
  return requestedAt.slice(0, 10)
}

/**
 * Findings do catálogo Analysis ∩ findings referenciados pelas Recs.
 * Findings fazem parte da lógica (W4) — ids órfãos são rejeitados.
 */
function resolvePlanFindingIds(
  recommendations: readonly Recommendation[],
  findings: readonly AnalysisFinding[],
): string[] {
  const catalog = new Set(findings.map((f) => f.id))
  if (catalog.size === 0) {
    throw new Error('INTEL_PLAN_FINDINGS_REQUIRED')
  }
  const fromRecs = recommendations.flatMap((r) => [...r.sourceFindingIds])
  const resolved = uniqueSorted(fromRecs.filter((id) => catalog.has(id)))
  if (resolved.length === 0) {
    throw new Error('INTEL_PLAN_FINDING_NOT_IN_CATALOG')
  }
  const missing = fromRecs.filter((id) => !catalog.has(id))
  if (missing.length > 0) {
    throw new Error(`INTEL_PLAN_ORPHAN_FINDING:${uniqueSorted(missing).join(',')}`)
  }
  return resolved
}

function alertIdsForRecommendation(
  alerts: readonly Alert[],
  recommendationId: string,
): string[] {
  return uniqueSorted(
    alerts
      .filter((a) => a.sourceRecommendationIds.includes(recommendationId))
      .map((a) => a.id),
  )
}

export type BuildPlanArgs = {
  storeId: string
  requestedAt: string
  objectiveCode: string
  ruleId: string
  ruleVersion: string
  alerts: readonly Alert[]
  recommendations: readonly Recommendation[]
  findings: readonly AnalysisFinding[]
}

/**
 * Um plano por objetivo — itens = Recommendations únicas (não 1:1 Alert).
 */
export function buildAggregatedActionPlan(args: BuildPlanArgs): ActionPlan {
  const recIds = uniqueSorted(args.recommendations.map((r) => r.id))
  const findingIds = resolvePlanFindingIds(
    args.recommendations,
    args.findings,
  )
  const alertIds = uniqueSorted(args.alerts.map((a) => a.id))

  const confidences = [
    ...args.recommendations.map((r) => r.operationalConfidence),
    ...args.alerts.map((a) => a.operationalConfidence),
    ...args.findings
      .filter((f) => findingIds.includes(f.id))
      .map((f) => f.operationalConfidence),
  ]
  const operationalConfidence =
    confidences.length === 0 ? 0 : Math.min(...confidences)

  const items: ActionPlanItem[] = args.recommendations.map((rec) => {
    const itemAlertIds = alertIdsForRecommendation(args.alerts, rec.id)
    return {
      id: `plan-item:${args.objectiveCode}:${rec.id}`,
      recommendationId: rec.id,
      titleCode: `intel.plan.item.${rec.recommendationCode.toLowerCase()}`,
      actionCode: rec.recommendedAction.actionCode,
      checklistLabelCode: `intel.plan.check.${rec.recommendationCode.toLowerCase()}`,
      urgency: rec.urgency,
      confidence: rec.confidence,
      operationalConfidence: Math.min(
        rec.operationalConfidence,
        operationalConfidence,
      ),
      sourceFindingIds: [...rec.sourceFindingIds],
      sourceAlertIds: itemAlertIds,
      deepLinkHint: rec.recommendedAction.deepLinkHint,
      status: 'TODO' as const,
    }
  })

  return {
    id: `plan:${args.objectiveCode}:${args.storeId}:${planDateFromIso(args.requestedAt)}`,
    storeId: args.storeId,
    planDate: planDateFromIso(args.requestedAt),
    objectiveCode: args.objectiveCode,
    items,
    createdAt: args.requestedAt,
    sourceAlertIds: alertIds,
    sourceRecommendationIds: recIds,
    sourceFindingIds: findingIds,
    operationalConfidence,
    urgency: maxUrgency(args.recommendations.map((r) => r.urgency)),
    ruleId: args.ruleId,
    ruleVersion: args.ruleVersion,
  }
}
