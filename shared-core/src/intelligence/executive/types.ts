import type { ActionPlan } from '../contracts/action-plan'
import type { Alert } from '../contracts/alert'
import type { AnalysisFinding } from '../contracts/analysis'
import type { DerivedKpi } from '../contracts/derived-kpi'
import type { ExecutiveSnapshot } from '../contracts/executive-snapshot'
import type { MemorySnapshot } from '../contracts/memory-snapshot'
import type { Recommendation } from '../contracts/recommendation'

/**
 * Executive consome apenas snapshots anteriores — sem Facts.
 */
export type ExecutiveEngineInput = {
  storeId: string
  requestedAt: string
  supportedKpis: readonly DerivedKpi[]
  partialKpis: readonly DerivedKpi[]
  blockedKpis: readonly DerivedKpi[]
  findings: readonly AnalysisFinding[]
  recommendations: readonly Recommendation[]
  alerts: readonly Alert[]
  actionPlans: readonly ActionPlan[]
  memory: MemorySnapshot
}

export type ExecutiveEngineResult = ExecutiveSnapshot
