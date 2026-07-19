import { lowInventoryTurnoverRule, inventoryCapitalPresentRule } from './rules/inventory-analysis'
import { lowMarginRule, negativeGrossProfitRule } from './rules/margin-analysis'
import {
  nonPositiveAverageTicketRule,
  zeroNetRevenueRule,
} from './rules/revenue-analysis'
import type { AnalysisRule } from './types'

/**
 * Registry de regras de Analysis (Cycle 3).
 * Novas regras: adicionar aqui — sem UI, sem SQL.
 */
export const ANALYSIS_RULES: readonly AnalysisRule[] = [
  lowMarginRule,
  negativeGrossProfitRule,
  zeroNetRevenueRule,
  nonPositiveAverageTicketRule,
  lowInventoryTurnoverRule,
  inventoryCapitalPresentRule,
]

export function listAnalysisRuleIds(): readonly string[] {
  return ANALYSIS_RULES.map((r) => r.ruleId)
}
