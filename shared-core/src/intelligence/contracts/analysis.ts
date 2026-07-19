import type { DerivedKpi } from './derived-kpi'
import type { KpiId } from './kpi'
import type { OperationalConfidence } from '../types/common'
import type { FactId } from '../facts/definitions'

/**
 * Analysis contracts (Cycle 3 + hardening v1.0).
 * Findings interpretam padrões — não são Recommendations.
 *
 * Migração: `confidence` → `operationalConfidence` (mesmo tipo 0–1).
 * Novo: `sourceFactIds` — Facts que sustentam o Finding (via KPIs).
 */

export type AnalysisSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export type AnalysisDomain =
  | 'SALES'
  | 'MARGIN'
  | 'STOCK'
  | 'CUSTOMER'
  | 'FINANCIAL'

export type AnalysisEvidence = {
  kpiId: KpiId
  value: unknown
  kpiStatus: DerivedKpi['status']
}

export type AnalysisFinding = {
  id: string
  severity: AnalysisSeverity
  domain: AnalysisDomain
  titleCode: string
  evidence: readonly AnalysisEvidence[]
  /** Facts que sustentam o Finding (união dos usedFactIds dos KPIs de evidência). */
  sourceFactIds: readonly FactId[]
  /** Confiança operacional 0–1 (nomenclatura alinhada ao pipeline). */
  operationalConfidence: OperationalConfidence
}

export type AnalysisThresholds = {
  targetGrossMargin: number
  lowGrossMarginWarning: number
  lowGrossMarginCritical: number
  lowInventoryTurnover: number
}

export const DEFAULT_ANALYSIS_THRESHOLDS: AnalysisThresholds = {
  targetGrossMargin: 0.25,
  lowGrossMarginWarning: 0.25,
  lowGrossMarginCritical: 0.1,
  lowInventoryTurnover: 1,
}

export type AnalysisEngineInput = {
  storeId: string
  requestedAt: string
  derivedKpis: readonly DerivedKpi[]
  thresholds?: Partial<AnalysisThresholds>
}

export type AnalysisSnapshot = {
  storeId: string
  analyzedAt: string
  findings: readonly AnalysisFinding[]
  kpisConsidered: number
  skippedInsufficientData: number
}
