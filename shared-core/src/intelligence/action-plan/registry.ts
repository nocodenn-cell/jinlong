import { aggregateByObjectiveRule } from './rules/objective-plans'
import type { ActionPlanRule } from './types'

export const ACTION_PLAN_RULES: readonly ActionPlanRule[] = [
  aggregateByObjectiveRule,
]

export function listActionPlanRuleIds(): string[] {
  return ACTION_PLAN_RULES.map((r) => r.ruleId)
}
