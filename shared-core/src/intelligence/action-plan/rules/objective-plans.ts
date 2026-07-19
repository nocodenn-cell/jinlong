import { buildAggregatedActionPlan } from '../build-plan'
import { objectiveForRecommendationCode } from '../objectives'
import type { ActionPlanRule } from '../types'

/**
 * Agrega Alerts/Recommendations do mesmo objectiveCode em um único plano.
 */
export const aggregateByObjectiveRule: ActionPlanRule = {
  ruleId: 'PLAN_AGGREGATE_BY_OBJECTIVE',
  ruleVersion: '1.0.0',
  objectiveCode: '*',
  recommendationCodes: [
    'REVIEW_MARGIN_DRIVERS',
    'REVIEW_SALES_ACTIVITY',
    'REVIEW_INVENTORY_CAPITAL',
  ],
  evaluate(ctx) {
    if (ctx.alerts.length === 0 || ctx.recommendations.length === 0) {
      return null
    }
    return buildAggregatedActionPlan({
      storeId: ctx.storeId,
      requestedAt: ctx.requestedAt,
      objectiveCode: ctx.objectiveCode,
      ruleId: 'PLAN_AGGREGATE_BY_OBJECTIVE',
      ruleVersion: '1.0.0',
      alerts: ctx.alerts,
      recommendations: ctx.recommendations,
      findings: ctx.findings,
    })
  },
}

export function resolveObjectiveCode(recommendationCode: string): string | null {
  return objectiveForRecommendationCode(recommendationCode)
}
