import type { ActionPlan } from '../contracts/action-plan'
import {
  isForbiddenActionPlanCode,
  isOrganizingActionCode,
} from '../policy/action-plan-policy'

export function assertActionPlanDeterminism(plan: ActionPlan): void {
  if (!plan.objectiveCode) {
    throw new Error(`INTEL_PLAN_NO_OBJECTIVE:${plan.id}`)
  }
  if (plan.sourceAlertIds.length === 0) {
    throw new Error(`INTEL_PLAN_NO_ALERT:${plan.id}`)
  }
  if (plan.sourceRecommendationIds.length === 0) {
    throw new Error(`INTEL_PLAN_NO_RECOMMENDATION:${plan.id}`)
  }
  if (plan.sourceFindingIds.length === 0) {
    throw new Error(`INTEL_PLAN_NO_FINDING:${plan.id}`)
  }
  if (plan.items.length === 0) {
    throw new Error(`INTEL_PLAN_NO_ITEMS:${plan.id}`)
  }
  if (!plan.ruleId || !plan.ruleVersion) {
    throw new Error(`INTEL_PLAN_NO_RULE:${plan.id}`)
  }
  if (
    typeof plan.operationalConfidence !== 'number' ||
    plan.operationalConfidence < 0 ||
    plan.operationalConfidence > 1
  ) {
    throw new Error(`INTEL_PLAN_BAD_CONFIDENCE:${plan.id}`)
  }

  for (const item of plan.items) {
    if (isForbiddenActionPlanCode(item.actionCode)) {
      throw new Error(`INTEL_PLAN_FORBIDDEN_ACTION:${item.actionCode}`)
    }
    if (!isOrganizingActionCode(item.actionCode)) {
      throw new Error(`INTEL_PLAN_NOT_ORGANIZING:${item.actionCode}`)
    }
    if (item.sourceFindingIds.length === 0) {
      throw new Error(`INTEL_PLAN_ITEM_NO_FINDING:${item.id}`)
    }
    if (item.operationalConfidence > plan.operationalConfidence) {
      throw new Error(`INTEL_PLAN_ITEM_CONFIDENCE_INFLATED:${item.id}`)
    }
  }
}
