import { buildAlertFromRecommendation } from '../build-alert'
import type { AlertRule } from '../types'

const REVIEW_CODES = [
  'REVIEW_MARGIN_DRIVERS',
  'REVIEW_SALES_ACTIVITY',
  'REVIEW_INVENTORY_CAPITAL',
] as const

/**
 * Eleva Recommendation a atenção priorizada — não copia nem muta a Rec.
 * Não executa Action.
 */
export const attentionFromRecommendationRule: AlertRule = {
  detectorId: 'ALERT_ATTENTION_FROM_RECOMMENDATION',
  detectorVersion: '1.0.0',
  recommendationCodes: REVIEW_CODES,
  evaluate(ctx) {
    const code = ctx.recommendation.recommendationCode
    if (!(REVIEW_CODES as readonly string[]).includes(code)) return null
    if (ctx.recommendation.evidences.length === 0) return 'SKIP'

    return buildAlertFromRecommendation({
      recommendation: ctx.recommendation,
      storeId: ctx.storeId,
      requestedAt: ctx.requestedAt,
      contextWindowDays: ctx.contextWindowDays,
      detectorId: 'ALERT_ATTENTION_FROM_RECOMMENDATION',
      detectorVersion: '1.0.0',
    })
  },
}
