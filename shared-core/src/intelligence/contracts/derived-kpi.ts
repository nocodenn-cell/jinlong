import type { FactId } from '../facts/definitions'
import type { ConfidenceLevel, IntelligenceSlice, OperationalConfidence } from '../types/common'
import type { FactProviderSupportLevel } from './provider-support'
import type { KpiId } from './kpi'

/**
 * KPI derivado (Cycle 2) — resultado do KPI Derivation Engine.
 */

export type DerivedKpiStatus =
  | 'SUPPORTED'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'UNAVAILABLE'

export type DerivedKpi = {
  id: KpiId
  nameCode: string
  descriptionCode: string
  owner: IntelligenceSlice
  requiredFacts: readonly FactId[]
  /** Propagado dos Facts (estrutural). */
  supportLevel: FactProviderSupportLevel
  status: DerivedKpiStatus
  operationalConfidence: OperationalConfidence
  confidence: ConfidenceLevel
  value: number | null
  unit?: string
  currency?: string
  formulaVersion: string
  inputFingerprint: string
  computedAt: string
  usedFactIds: readonly FactId[]
  blockedReasonCode?: string
}

export type KpiDerivationDefinition = {
  id: KpiId
  nameCode: string
  descriptionCode: string
  owner: IntelligenceSlice
  requiredFacts: readonly FactId[]
  formulaVersion: string
  unit?: string
  currency?: string
}
