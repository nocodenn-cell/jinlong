import { MIN_RECOMMENDATION_OPERATIONAL_CONFIDENCE } from '../../policy/recommendation-policy'
import {
  buildRecommendationFromFinding,
  severityMeetsMin,
} from '../build-recommendation'
import type { RecommendationRule } from '../types'

function belowMinConfidence(confidence: number): boolean {
  return confidence < MIN_RECOMMENDATION_OPERATIONAL_CONFIDENCE
}

const MARGIN_FINDINGS = ['LOW_MARGIN', 'NEGATIVE_GROSS_PROFIT'] as const
const SALES_FINDINGS = [
  'ZERO_NET_REVENUE',
  'NON_POSITIVE_AVERAGE_TICKET',
] as const
const INVENTORY_FINDINGS = ['LOW_INVENTORY_TURNOVER'] as const

/**
 * Findings de margem → revisão de drivers (não "subir preço").
 */
export const reviewMarginDriversRule: RecommendationRule = {
  ruleId: 'REC_REVIEW_MARGIN_DRIVERS',
  ruleVersion: '1.0.0',
  basedOnFindingIds: MARGIN_FINDINGS,
  minSeverity: 'WARNING',
  evaluate(ctx) {
    const { finding } = ctx
    if (!(MARGIN_FINDINGS as readonly string[]).includes(finding.id)) return null
    if (!severityMeetsMin(finding.severity, 'WARNING')) return null
    if (belowMinConfidence(finding.operationalConfidence)) return 'SKIP_POLICY'

    return buildRecommendationFromFinding({
      finding,
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      ruleId: 'REC_REVIEW_MARGIN_DRIVERS',
      ruleVersion: '1.0.0',
      storeId: ctx.storeId,
      requestedAt: ctx.requestedAt,
      action: {
        actionCode: 'REVIEW_MARGIN_DRIVERS',
        deepLinkHint: '/admin/catalogo',
      },
      causeCodes: [`intel.rec.cause.from_finding.${finding.id}`],
      assumptionCodes: ['intel.rec.assumption.margin_kpi_usable'],
    })
  },
}

/**
 * Findings de receita → revisar atividade comercial (não forçar venda).
 */
export const reviewSalesActivityRule: RecommendationRule = {
  ruleId: 'REC_REVIEW_SALES_ACTIVITY',
  ruleVersion: '1.0.0',
  basedOnFindingIds: SALES_FINDINGS,
  minSeverity: 'WARNING',
  evaluate(ctx) {
    const { finding } = ctx
    if (!(SALES_FINDINGS as readonly string[]).includes(finding.id)) return null
    if (!severityMeetsMin(finding.severity, 'WARNING')) return null
    if (belowMinConfidence(finding.operationalConfidence)) return 'SKIP_POLICY'

    return buildRecommendationFromFinding({
      finding,
      recommendationCode: 'REVIEW_SALES_ACTIVITY',
      ruleId: 'REC_REVIEW_SALES_ACTIVITY',
      ruleVersion: '1.0.0',
      storeId: ctx.storeId,
      requestedAt: ctx.requestedAt,
      action: {
        actionCode: 'REVIEW_SALES_ACTIVITY',
        deepLinkHint: '/admin/vendas',
      },
      causeCodes: [`intel.rec.cause.from_finding.${finding.id}`],
      assumptionCodes: ['intel.rec.assumption.sales_kpi_usable'],
    })
  },
}

/**
 * Baixa rotatividade → revisar capital em estoque (não liquidar automaticamente).
 */
export const reviewInventoryCapitalRule: RecommendationRule = {
  ruleId: 'REC_REVIEW_INVENTORY_CAPITAL',
  ruleVersion: '1.0.0',
  basedOnFindingIds: INVENTORY_FINDINGS,
  minSeverity: 'WARNING',
  evaluate(ctx) {
    const { finding } = ctx
    if (!(INVENTORY_FINDINGS as readonly string[]).includes(finding.id)) {
      return null
    }
    if (!severityMeetsMin(finding.severity, 'WARNING')) return null
    if (belowMinConfidence(finding.operationalConfidence)) return 'SKIP_POLICY'

    return buildRecommendationFromFinding({
      finding,
      recommendationCode: 'REVIEW_INVENTORY_CAPITAL',
      ruleId: 'REC_REVIEW_INVENTORY_CAPITAL',
      ruleVersion: '1.0.0',
      storeId: ctx.storeId,
      requestedAt: ctx.requestedAt,
      action: {
        actionCode: 'REVIEW_INVENTORY_CAPITAL',
        deepLinkHint: '/admin/estoque',
      },
      causeCodes: [`intel.rec.cause.from_finding.${finding.id}`],
      assumptionCodes: ['intel.rec.assumption.inventory_kpi_usable'],
    })
  },
}
