import type { ActionPlan } from '../contracts/action-plan'
import type { Alert } from '../contracts/alert'
import type { AnalysisFinding } from '../contracts/analysis'
import type { MemorySnapshot } from '../contracts/memory-snapshot'
import type { Recommendation } from '../contracts/recommendation'
import type { FactConfidenceSummary } from '../contracts/recommendation-purity'

/**
 * Input do Memory Engine: artefatos do pipeline — sem Facts, sem I/O.
 */
export type MemoryEngineInput = {
  storeId: string
  requestedAt: string
  findings: readonly AnalysisFinding[]
  recommendations: readonly Recommendation[]
  alerts: readonly Alert[]
  actionPlans: readonly ActionPlan[]
  confidenceSummary: FactConfidenceSummary
}

export type MemoryEngineResult = MemorySnapshot
