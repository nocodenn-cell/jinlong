import type { Alert } from '../contracts/alert'
import type { AnalysisFinding } from '../contracts/analysis'
import type { DerivedKpi } from '../contracts/derived-kpi'
import type { ExecutiveSnapshot } from '../contracts/executive-snapshot'
import type { KpiId } from '../contracts/kpi'
import { assertExecutiveDeterminism } from './determinism'
import type { ExecutiveEngineInput } from './types'

const RULE_ID = 'EXECUTIVE_COMPOSE'
const RULE_VERSION = '1.0.0'

function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort()
}

function minConfidence(values: readonly number[]): number {
  if (values.length === 0) return 0
  return Math.min(...values)
}

function countSeverity(
  findings: readonly AnalysisFinding[],
  severity: AnalysisFinding['severity'],
): number {
  return findings.filter((f) => f.severity === severity).length
}

function countAlertSeverity(
  alerts: readonly Alert[],
  severity: Alert['severity'],
): number {
  return alerts.filter((a) => a.severity === severity).length
}

function highlightKpis(supported: readonly DerivedKpi[]): KpiId[] {
  return supported
    .filter((k) => k.value !== null)
    .slice(0, 5)
    .map((k) => k.id)
}

function buildHeadlines(input: ExecutiveEngineInput): string[] {
  const codes: string[] = []
  if (input.alerts.some((a) => a.severity === 'CRITICAL')) {
    codes.push('intel.executive.headline.critical_alerts')
  }
  if (input.actionPlans.length > 0) {
    codes.push('intel.executive.headline.action_plans_ready')
  }
  if (input.findings.length === 0 && input.recommendations.length === 0) {
    codes.push('intel.executive.headline.no_attention_items')
  }
  if (codes.length === 0) {
    codes.push('intel.executive.headline.pipeline_complete')
  }
  return codes
}

/**
 * Executive Engine — puro.
 * Compõe ExecutiveSnapshot a partir de KPIs/Findings/Recs/Alerts/Plans/Memory.
 * Não lê Facts.
 */
export function runExecutiveEngine(
  input: ExecutiveEngineInput,
): ExecutiveSnapshot {
  const sourceFindingIds = uniqueSorted(input.findings.map((f) => f.id))
  const sourceRecommendationIds = uniqueSorted(
    input.recommendations.map((r) => r.id),
  )
  const sourceAlertIds = uniqueSorted(input.alerts.map((a) => a.id))
  const sourceActionPlanIds = uniqueSorted(input.actionPlans.map((p) => p.id))

  const operationalConfidence = minConfidence([
    ...input.findings.map((f) => f.operationalConfidence),
    ...input.recommendations.map((r) => r.operationalConfidence),
    ...input.alerts.map((a) => a.operationalConfidence),
    ...input.actionPlans.map((p) => p.operationalConfidence),
    input.memory.operationalConfidence,
  ])

  const sortedAlerts = [...input.alerts].sort(
    (a, b) => b.urgency.score - a.urgency.score,
  )

  const snapshot: ExecutiveSnapshot = {
    storeId: input.storeId,
    composedAt: input.requestedAt,
    ruleId: RULE_ID,
    ruleVersion: RULE_VERSION,
    headlineCodes: buildHeadlines(input),
    kpiSummary: {
      supported: input.supportedKpis.length,
      partial: input.partialKpis.length,
      blocked: input.blockedKpis.length,
      highlightKpiIds: highlightKpis(input.supportedKpis),
    },
    findingSummary: {
      count: input.findings.length,
      critical: countSeverity(input.findings, 'CRITICAL'),
      warning: countSeverity(input.findings, 'WARNING'),
      info: countSeverity(input.findings, 'INFO'),
    },
    recommendationSummary: {
      count: input.recommendations.length,
      codes: uniqueSorted(
        input.recommendations.map((r) => r.recommendationCode),
      ),
    },
    alertSummary: {
      count: input.alerts.length,
      critical: countAlertSeverity(input.alerts, 'CRITICAL'),
      warning: countAlertSeverity(input.alerts, 'WARNING'),
      info: countAlertSeverity(input.alerts, 'INFO'),
    },
    actionPlanSummary: {
      planCount: input.actionPlans.length,
      itemCount: input.actionPlans.reduce((n, p) => n + p.items.length, 0),
      objectiveCodes: uniqueSorted(
        input.actionPlans.map((p) => p.objectiveCode),
      ),
    },
    memoryEntryCount: input.memory.entries.length,
    operationalConfidence,
    topAlertIds: sortedAlerts.slice(0, 5).map((a) => a.id),
    topActionPlanIds: input.actionPlans.slice(0, 5).map((p) => p.id),
    sourceFindingIds,
    sourceRecommendationIds,
    sourceAlertIds,
    sourceActionPlanIds,
  }

  assertExecutiveDeterminism(snapshot)
  return snapshot
}
