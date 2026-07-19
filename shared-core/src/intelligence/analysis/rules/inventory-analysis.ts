import {
  evidenceFrom,
  minConfidence,
  sourceFactIdsFrom,
  usableKpi,
} from '../kpi-access'
import type { AnalysisRule } from '../types'

/**
 * Padrões de estoque / capital — sem recomendar liquidação ou compra.
 */
export const lowInventoryTurnoverRule: AnalysisRule = {
  ruleId: 'LOW_INVENTORY_TURNOVER',
  domain: 'STOCK',
  evaluate(ctx) {
    const turnover = usableKpi(ctx.byId, 'InventoryTurnover')
    if (!turnover) return 'SKIP_INSUFFICIENT'
    const value = turnover.value as number
    if (value >= ctx.thresholds.lowInventoryTurnover) return null
    return {
      id: 'LOW_INVENTORY_TURNOVER',
      severity: value <= 0 ? 'CRITICAL' : 'WARNING',
      domain: 'STOCK',
      titleCode: 'intel.analysis.low_inventory_turnover.title',
      evidence: [
        {
          kpiId: 'InventoryTurnover',
          value: {
            observed: value,
            threshold: ctx.thresholds.lowInventoryTurnover,
          },
          kpiStatus: turnover.status,
        },
      ],
      sourceFactIds: sourceFactIdsFrom([turnover]),
      operationalConfidence: minConfidence([turnover]),
    }
  },
}

export const inventoryCapitalPresentRule: AnalysisRule = {
  ruleId: 'INVENTORY_CAPITAL_OBSERVED',
  domain: 'STOCK',
  evaluate(ctx) {
    const capital = usableKpi(ctx.byId, 'InventoryCapital')
    if (!capital) return 'SKIP_INSUFFICIENT'
    const value = capital.value as number
    if (value <= 0) return null
    return {
      id: 'INVENTORY_CAPITAL_OBSERVED',
      severity: 'INFO',
      domain: 'STOCK',
      titleCode: 'intel.analysis.inventory_capital_observed.title',
      evidence: [evidenceFrom(capital)],
      sourceFactIds: sourceFactIdsFrom([capital]),
      operationalConfidence: minConfidence([capital]),
    }
  },
}
