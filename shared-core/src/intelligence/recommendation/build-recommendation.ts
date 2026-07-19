import type { AnalysisFinding, AnalysisSeverity } from '../contracts/analysis'
import type {
  Recommendation,
  RecommendationCategory,
  RecommendedAction,
} from '../contracts/recommendation'
import type { OperationalDomain, UrgencyTier } from '../types/common'
import { operationalToConfidenceLevel } from '../kpi/confidence'
import type { DerivedKpiStatus } from '../contracts/derived-kpi'

function domainsForFinding(
  domain: AnalysisFinding['domain'],
): readonly OperationalDomain[] {
  if (domain === 'MARGIN') return ['sales', 'products']
  if (domain === 'STOCK') return ['inventory']
  if (domain === 'SALES') return ['sales']
  if (domain === 'CUSTOMER') return ['customers']
  if (domain === 'FINANCIAL') return ['financial', 'cash']
  return []
}

const SEVERITY_RANK: Record<AnalysisSeverity, number> = {
  INFO: 0,
  WARNING: 1,
  CRITICAL: 2,
}

export function severityMeetsMin(
  severity: AnalysisSeverity,
  min: AnalysisSeverity,
): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[min]
}

export function severityToUrgency(severity: AnalysisSeverity): UrgencyTier {
  if (severity === 'CRITICAL') return 'P0'
  if (severity === 'WARNING') return 'P1'
  return 'P3'
}

export function domainToCategory(
  domain: AnalysisFinding['domain'],
): RecommendationCategory {
  if (domain === 'MARGIN') return 'MARGIN'
  if (domain === 'STOCK') return 'INVENTORY'
  if (domain === 'SALES') return 'SALES'
  if (domain === 'CUSTOMER') return 'CUSTOMER'
  if (domain === 'FINANCIAL') return 'CASH'
  return 'OTHER'
}

function kpiStatusFromEvidence(
  finding: AnalysisFinding,
): DerivedKpiStatus {
  const status = finding.evidence[0]?.kpiStatus
  if (
    status === 'SUPPORTED' ||
    status === 'PARTIAL' ||
    status === 'BLOCKED' ||
    status === 'UNAVAILABLE'
  ) {
    return status
  }
  return 'PARTIAL'
}

export type BuildRecommendationArgs = {
  finding: AnalysisFinding
  recommendationCode: string
  ruleId: string
  ruleVersion: string
  action: RecommendedAction
  storeId: string
  requestedAt: string
  causeCodes: readonly string[]
  assumptionCodes?: readonly string[]
  limitations?: readonly string[]
}

/**
 * Materializa Recommendation rastreável a partir de um Finding.
 */
export function buildRecommendationFromFinding(
  args: BuildRecommendationArgs,
): Recommendation {
  const { finding } = args
  const kpisUsed = finding.evidence.map((e) => ({
    kpiId: e.kpiId,
    formulaVersion: '1.0.0',
  }))
  const evidences = finding.evidence.map((e) => ({
    kind: 'kpi' as const,
    code: `intel.rec.evidence.${finding.id}.${e.kpiId}`,
    kpiId: e.kpiId,
    observed:
      typeof e.value === 'number' ||
      typeof e.value === 'string' ||
      typeof e.value === 'boolean'
        ? e.value
        : JSON.stringify(e.value),
    confidence: operationalToConfidenceLevel(
      finding.confidence,
      kpiStatusFromEvidence(finding),
    ),
  }))

  return {
    id: `rec:${args.recommendationCode}:${finding.id}`,
    recommendationCode: args.recommendationCode,
    category: domainToCategory(finding.domain),
    problemCode: finding.id,
    evidences,
    financialImpact: {
      metric: 'unestimated',
      estimate: { amount: 0, currency: 'BRL' },
      horizonDays: 0,
      confidence: 'LOW',
    },
    confidence: operationalToConfidenceLevel(
      finding.confidence,
      kpiStatusFromEvidence(finding),
    ),
    operationalConfidence: finding.confidence,
    urgency: severityToUrgency(finding.severity),
    recommendedAction: args.action,
    justification: {
      causeCodes: args.causeCodes,
      assumptionCodes: args.assumptionCodes ?? [],
      limitations: args.limitations ?? [
        'intel.rec.limitation.decision_support_only',
      ],
    },
    kpisUsed,
    domainsConsulted: domainsForFinding(finding.domain),
    emittedAt: args.requestedAt,
    status: 'OPEN',
    sourceFindingIds: [finding.id],
    ruleId: args.ruleId,
    ruleVersion: args.ruleVersion,
    inputFingerprint: `${args.storeId}:${finding.id}:${args.recommendationCode}:${finding.confidence}`,
  }
}
