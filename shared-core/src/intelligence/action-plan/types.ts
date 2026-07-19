import type { ActionPlan } from '../contracts/action-plan'
import type { Alert } from '../contracts/alert'
import type { AnalysisFinding } from '../contracts/analysis'
import type { Recommendation } from '../contracts/recommendation'

export type ActionPlanRuleContext = {
  storeId: string
  requestedAt: string
  planDate: string
  objectiveCode: string
  alerts: readonly Alert[]
  recommendations: readonly Recommendation[]
  findings: readonly AnalysisFinding[]
}

export type ActionPlanRule = {
  ruleId: string
  ruleVersion: string
  objectiveCode: string
  recommendationCodes: readonly string[]
  evaluate(ctx: ActionPlanRuleContext): ActionPlan | null
}

export type ActionPlanEngineInput = {
  storeId: string
  requestedAt: string
  alerts: readonly Alert[]
  recommendations: readonly Recommendation[]
  findings: readonly AnalysisFinding[]
}

export type ActionPlanSnapshot = {
  storeId: string
  emittedAt: string
  actionPlans: readonly ActionPlan[]
  objectivesConsidered: number
}
