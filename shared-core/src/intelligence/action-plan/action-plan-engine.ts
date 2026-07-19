import type { ActionPlan } from '../contracts/action-plan'
import type { Alert } from '../contracts/alert'
import type { Recommendation } from '../contracts/recommendation'
import { assertActionPlanDeterminism } from './determinism'
import { objectiveForRecommendationCode } from './objectives'
import { ACTION_PLAN_RULES } from './registry'
import type { ActionPlanEngineInput, ActionPlanSnapshot } from './types'

function planDateFromIso(requestedAt: string): string {
  return requestedAt.slice(0, 10)
}

function groupByObjective(
  alerts: readonly Alert[],
  recommendations: readonly Recommendation[],
): Map<
  string,
  { alerts: Alert[]; recommendations: Recommendation[] }
> {
  const recById = new Map(recommendations.map((r) => [r.id, r]))
  const groups = new Map<
    string,
    { alerts: Alert[]; recommendations: Recommendation[]; recSeen: Set<string> }
  >()

  for (const alert of alerts) {
    for (const recId of alert.sourceRecommendationIds) {
      const rec = recById.get(recId)
      if (!rec) continue
      const objective = objectiveForRecommendationCode(rec.recommendationCode)
      if (!objective) continue

      let group = groups.get(objective)
      if (!group) {
        group = { alerts: [], recommendations: [], recSeen: new Set() }
        groups.set(objective, group)
      }
      if (!group.alerts.some((a) => a.id === alert.id)) {
        group.alerts.push(alert)
      }
      if (!group.recSeen.has(rec.id)) {
        group.recSeen.add(rec.id)
        group.recommendations.push(rec)
      }
    }
  }

  return new Map(
    [...groups.entries()].map(([k, v]) => [
      k,
      { alerts: v.alerts, recommendations: v.recommendations },
    ]),
  )
}

/**
 * Action Plan Engine — puro.
 * Alerts + Recommendations → planos agregados por objetivo. Sem execução.
 */
export function runActionPlanEngine(
  input: ActionPlanEngineInput,
): ActionPlanSnapshot {
  const groups = groupByObjective(input.alerts, input.recommendations)
  const actionPlans: ActionPlan[] = []
  const rule = ACTION_PLAN_RULES[0]

  for (const [objectiveCode, group] of groups) {
    if (!rule) break
    const plan = rule.evaluate({
      storeId: input.storeId,
      requestedAt: input.requestedAt,
      planDate: planDateFromIso(input.requestedAt),
      objectiveCode,
      alerts: group.alerts,
      recommendations: group.recommendations,
      findings: input.findings,
    })
    if (!plan) continue
    assertActionPlanDeterminism(plan)
    actionPlans.push(plan)
  }

  actionPlans.sort((a, b) => a.objectiveCode.localeCompare(b.objectiveCode))

  return {
    storeId: input.storeId,
    emittedAt: input.requestedAt,
    actionPlans,
    objectivesConsidered: groups.size,
  }
}
