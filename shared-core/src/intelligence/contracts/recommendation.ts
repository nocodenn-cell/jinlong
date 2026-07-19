import type {
  ConfidenceLevel,
  EntityRef,
  IntelligenceSlice,
  MoneyAmount,
  OperationalDomain,
  UrgencyTier,
} from '../types/common'
import type { Evidence } from '../types/evidence'
import type { KpiId } from './kpi'

/**
 * Recommendation Contract — ADR-011 (campos mínimos obrigatórios).
 * Cycle 0: contrato apenas. Sem engine.
 */

export type RecommendationCategory =
  | 'MARGIN'
  | 'CASH'
  | 'CUSTOMER'
  | 'INVENTORY'
  | 'SUPPLIER'
  | 'EXECUTIVE'
  | 'SALES'
  | 'OTHER'

export type RecommendationStatus =
  | 'OPEN'
  | 'ACCEPTED'
  | 'DISMISSED'
  | 'SNOOZED'
  | 'EXPIRED'
  | 'COMPLETED'

export type FinancialImpactEstimate = {
  metric: string
  estimate: MoneyAmount
  horizonDays: number
  confidence: ConfidenceLevel
}

export type RecommendedAction = {
  actionCode: string
  targetRef?: EntityRef
  /** Rota entity-ssot sugerida — DI não navega nem muta. */
  deepLinkHint?: string
}

export type RecommendationJustification = {
  causeCodes: readonly string[]
  assumptionCodes: readonly string[]
  limitations: readonly string[]
}

export type KpiUsageRef = {
  kpiId: KpiId
  formulaVersion: string
}

/**
 * Recomendação explicável (ADR-011 + Cycle 4 determinism gate).
 * Opção de revisão — não decisão operacional (ex.: NÃO "increase_price").
 */
export type Recommendation = {
  /** ID da emissão */
  id: string
  /** Code estável da opção (ex.: REVIEW_MARGIN_DRIVERS). */
  recommendationCode: string
  category: RecommendationCategory
  /** Problema / finding espelhado (ex.: LOW_MARGIN). */
  problemCode: string
  problemParams?: Readonly<Record<string, string | number | boolean>>
  evidences: readonly Evidence[]
  financialImpact: FinancialImpactEstimate
  confidence: ConfidenceLevel
  /** Confiança operacional 0–1 (propagada dos Findings/KPIs). */
  operationalConfidence: number
  urgency: UrgencyTier
  urgencyScore?: number
  recommendedAction: RecommendedAction
  justification: RecommendationJustification
  kpisUsed: readonly KpiUsageRef[]
  domainsConsulted: readonly OperationalDomain[]
  emittedAt: string
  status: RecommendationStatus
  /** Determinism: Findings que originaram esta recommendation. */
  sourceFindingIds: readonly string[]
  /** Rastreio ADR-011 */
  ruleId: string
  ruleVersion: string
  inputFingerprint: string
  relatedAlertIds?: readonly string[]
  sourceSlice?: IntelligenceSlice
}
