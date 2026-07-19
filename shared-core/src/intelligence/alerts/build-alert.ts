import type { Alert } from '../contracts/alert'
import type { Recommendation } from '../contracts/recommendation'
import type { IntelligenceSlice } from '../types/common'
import {
  computeAlertUrgency,
  planSeverityFromRecommendation,
} from './urgency'

function sliceForCategory(
  category: Recommendation['category'],
): IntelligenceSlice {
  if (category === 'MARGIN' || category === 'CASH' || category === 'EXECUTIVE') {
    return 'financial'
  }
  if (category === 'INVENTORY') return 'inventory'
  if (category === 'CUSTOMER') return 'customer'
  if (category === 'SUPPLIER') return 'supplier'
  return 'sales'
}

function contextWindow(requestedAt: string, days: number) {
  const end = new Date(requestedAt)
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
  }
}

function titleCodeFor(recommendationCode: string): string {
  return `intel.alert.title.${recommendationCode.toLowerCase()}`
}

export type BuildAlertArgs = {
  recommendation: Recommendation
  storeId: string
  requestedAt: string
  contextWindowDays: number
  detectorId: string
  detectorVersion: string
}

/**
 * Materializa Alert a partir de uma Recommendation.
 * operationalConfidence = Rec (nunca aumentada pela urgency).
 */
export function buildAlertFromRecommendation(args: BuildAlertArgs): Alert {
  const { recommendation: rec } = args
  const urgency = computeAlertUrgency(rec)
  const severityPlan = planSeverityFromRecommendation(rec)
  const window = contextWindow(args.requestedAt, args.contextWindowDays)

  return {
    id: `alert:${rec.recommendationCode}:${rec.id}`,
    detectorId: args.detectorId,
    detectorVersion: args.detectorVersion,
    sourceSlice: sliceForCategory(rec.category),
    severity: severityPlan.severity,
    severityJustificationCode: severityPlan.justificationCode,
    sourceRecommendationIds: [rec.id],
    titleCode: titleCodeFor(rec.recommendationCode),
    operationalConfidence: rec.operationalConfidence,
    urgency,
    createdAt: args.requestedAt,
    impact: {
      metric: rec.financialImpact.metric,
      magnitude: rec.financialImpact.estimate,
      horizonDays: args.contextWindowDays,
      descriptionCode: `intel.alert.impact.${rec.recommendationCode.toLowerCase()}`,
    },
    evidences: rec.evidences,
    scope: { storeId: args.storeId },
    window,
    relatedKpis: rec.kpisUsed.map((k) => k.kpiId),
    status: 'OPEN',
    dedupeKey: `${args.storeId}:${rec.recommendationCode}:${rec.problemCode}`,
    detectedAt: args.requestedAt,
  }
}
