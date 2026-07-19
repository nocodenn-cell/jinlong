import type { OperationalConfidence } from '../types/common'
import type { KpiId } from './kpi'

/**
 * Executive Snapshot — Cycle 8.
 * Composição read-model a partir dos snapshots anteriores.
 * Não consulta Facts diretamente.
 */

export type ExecutiveKpiSummary = {
  supported: number
  partial: number
  blocked: number
  highlightKpiIds: readonly KpiId[]
}

export type ExecutiveFindingSummary = {
  count: number
  critical: number
  warning: number
  info: number
}

export type ExecutiveRecommendationSummary = {
  count: number
  codes: readonly string[]
}

export type ExecutiveAlertSummary = {
  count: number
  critical: number
  warning: number
  info: number
}

export type ExecutiveActionPlanSummary = {
  planCount: number
  itemCount: number
  objectiveCodes: readonly string[]
}

export type ExecutiveSnapshot = {
  storeId: string
  composedAt: string
  ruleId: string
  ruleVersion: string
  headlineCodes: readonly string[]
  kpiSummary: ExecutiveKpiSummary
  findingSummary: ExecutiveFindingSummary
  recommendationSummary: ExecutiveRecommendationSummary
  alertSummary: ExecutiveAlertSummary
  actionPlanSummary: ExecutiveActionPlanSummary
  memoryEntryCount: number
  operationalConfidence: OperationalConfidence
  topAlertIds: readonly string[]
  topActionPlanIds: readonly string[]
  sourceFindingIds: readonly string[]
  sourceRecommendationIds: readonly string[]
  sourceAlertIds: readonly string[]
  sourceActionPlanIds: readonly string[]
}
