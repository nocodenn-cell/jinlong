import { evidenceFrom, minConfidence, usableKpi } from '../kpi-access'
import type { AnalysisFinding, AnalysisRule } from '../types'

/**
 * Interpreta desvio de margem — NÃO recomenda ação (ex.: "aumente preço").
 */
export const lowMarginRule: AnalysisRule = {
  ruleId: 'LOW_MARGIN',
  domain: 'MARGIN',
  evaluate(ctx) {
    const margin = usableKpi(ctx.byId, 'GrossMargin')
    if (!margin) return 'SKIP_INSUFFICIENT'

    const value = margin.value as number
    const { lowGrossMarginWarning, lowGrossMarginCritical, targetGrossMargin } =
      ctx.thresholds

    if (value >= lowGrossMarginWarning) return null

    const severity = value < lowGrossMarginCritical ? 'CRITICAL' : 'WARNING'
    const finding: AnalysisFinding = {
      id: 'LOW_MARGIN',
      severity,
      domain: 'MARGIN',
      titleCode: 'intel.analysis.low_margin.title',
      evidence: [
        {
          kpiId: 'GrossMargin',
          value: { observed: value, target: targetGrossMargin },
          kpiStatus: margin.status,
        },
      ],
      confidence: minConfidence([margin]),
    }
    return finding
  },
}

export const negativeGrossProfitRule: AnalysisRule = {
  ruleId: 'NEGATIVE_GROSS_PROFIT',
  domain: 'MARGIN',
  evaluate(ctx) {
    const profit = usableKpi(ctx.byId, 'GrossProfit')
    if (!profit) return 'SKIP_INSUFFICIENT'
    const value = profit.value as number
    if (value >= 0) return null
    return {
      id: 'NEGATIVE_GROSS_PROFIT',
      severity: 'CRITICAL',
      domain: 'MARGIN',
      titleCode: 'intel.analysis.negative_gross_profit.title',
      evidence: [evidenceFrom(profit)],
      confidence: minConfidence([profit]),
    }
  },
}
