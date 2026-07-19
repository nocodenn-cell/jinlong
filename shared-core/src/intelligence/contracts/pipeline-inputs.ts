import type { FactEnvelope } from './fact'
import type { KpiValue } from './kpi'
import type { AnalysisSnapshot } from './analysis'

/**
 * Inputs tipados do pipeline.
 */

export type KpiInput = {
  storeId: string
  facts: readonly FactEnvelope[]
  requestedAt: string
}

/** @deprecated Cycle 1 — use AnalysisEngineInput com derivedKpis. */
export type AnalysisInput = {
  storeId: string
  facts: readonly FactEnvelope[]
  kpiValues: readonly KpiValue[]
  requestedAt: string
}

/** Alias estável no snapshot. */
export type AnalysisResult = AnalysisSnapshot
