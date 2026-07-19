import {
  reviewInventoryCapitalRule,
  reviewMarginDriversRule,
  reviewSalesActivityRule,
} from './rules/review-options'
import type { RecommendationRule } from './types'

export const RECOMMENDATION_RULES: readonly RecommendationRule[] = [
  reviewMarginDriversRule,
  reviewSalesActivityRule,
  reviewInventoryCapitalRule,
]

export function listRecommendationRuleIds(): string[] {
  return RECOMMENDATION_RULES.map((r) => r.ruleId)
}
