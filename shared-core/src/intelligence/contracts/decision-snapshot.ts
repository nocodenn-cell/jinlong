import type { DiGateId } from '../gates/data-readiness'
import type { ActionPlan } from './action-plan'
import type { Alert } from './alert'
import type { DerivedKpi } from './derived-kpi'
import type { ExecutiveSnapshot } from './executive-snapshot'
import type { FactEnvelope } from './fact'
import type { KpiValue } from './kpi'
import type { MemorySnapshot } from './memory-snapshot'
import type { AnalysisResult } from './pipeline-inputs'
import type { FactConfidenceSummary } from './recommendation-purity'
import type { Recommendation } from './recommendation'
import type { FactId } from '../facts/definitions'
import type { FactProviderSupportLevel } from './provider-support'

/**
 * Decision Snapshot — contrato único do ciclo (Cycle 1–8).
 */

export type BlockedFactRecord = {
  factId: FactId
  supportLevel: FactProviderSupportLevel
  reason:
    | 'UNSUPPORTED'
    | 'DEPRECATED'
    | 'GATE_OPEN'
    | 'CONTEXT_ONLY'
    | 'WAVE_A_EXCLUDED'
    | 'DUPLICATE'
  gateIds: readonly DiGateId[]
  explanationCode: string
}

export type EngineCycleMetrics = {
  providersLoaded: number
  providersIgnored: number
  factsLoaded: number
  factsBlocked: number
  factsUsed: number
  factsPartialIdentified: number
  averageOperationalConfidence: number
  averageOperationalConfidencePercent: number
  kpisSupported: number
  kpisPartial: number
  kpisBlocked: number
  analysisFindings: number
  analysisSkippedInsufficient: number
  actionPlans: number
  memoryEntries: number
  /** ms — medição interna do loop (sem APM externo). */
  executionTimeMs: number
}

export type DecisionSnapshot = {
  timestamp: string
  storeId: string
  factsUsed: readonly FactEnvelope[]
  factsPartialIdentified: readonly FactEnvelope[]
  factsBlocked: readonly BlockedFactRecord[]
  derivedKpis: readonly DerivedKpi[]
  supportedKpis: readonly DerivedKpi[]
  partialKpis: readonly DerivedKpi[]
  blockedKpis: readonly DerivedKpi[]
  kpiValues: readonly KpiValue[]
  analysis: AnalysisResult
  confidenceSummary: FactConfidenceSummary
  gatesEncountered: readonly DiGateId[]
  recommendations: readonly Recommendation[]
  alerts: readonly Alert[]
  actionPlans: readonly ActionPlan[]
  memory: MemorySnapshot
  executive: ExecutiveSnapshot
  metrics: EngineCycleMetrics
}
