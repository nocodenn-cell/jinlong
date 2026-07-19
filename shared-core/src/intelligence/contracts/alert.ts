import type {
  EntityRef,
  IntelligenceSlice,
  MoneyAmount,
  OperationalConfidence,
  TimeWindow,
} from '../types/common'
import type { Evidence } from '../types/evidence'
import type { KpiId } from './kpi'

/**
 * Alert Contract — ADR-011 + Cycle 5 DecisionAlert fields.
 * Alert ≠ Recommendation; não executa Action.
 */

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SNOOZED'

export type AlertImpact = {
  metric: string
  magnitude?: MoneyAmount | number
  horizonDays?: number
  descriptionCode: string
}

export type AlertSuggestedAction = {
  actionCode: string
  deepLinkHint?: string
  recommendationId?: string
}

export type AlertScope = {
  storeId: string
  entityRef?: EntityRef
}

/** Urgência temporal — ortogonal à confidence. */
export type AlertUrgency = {
  score: number
  reason: string
}

/**
 * Campos Cycle 5 (DecisionAlert).
 * evidence no doc de missão = `evidences` no contrato ADR.
 */
export type DecisionAlertCore = {
  id: string
  severity: AlertSeverity
  sourceRecommendationIds: readonly string[]
  titleCode: string
  operationalConfidence: OperationalConfidence
  urgency: AlertUrgency
  /** Justificativa da severity (não confundir com confidence). */
  severityJustificationCode: string
  createdAt?: string
}

/**
 * Alerta derivado de Recommendation + urgency + context.
 * Integração com Auditoria = correlação por refs (ADR-011).
 */
export type Alert = DecisionAlertCore & {
  detectorId: string
  detectorVersion: string
  sourceSlice: IntelligenceSlice
  impact: AlertImpact
  evidences: readonly Evidence[]
  suggestedAction?: AlertSuggestedAction
  scope: AlertScope
  window: TimeWindow
  relatedKpis: readonly KpiId[]
  status: AlertStatus
  dedupeKey: string
  detectedAt: string
  operationalEventRefs?: readonly {
    source: string
    id: string
  }[]
}

/** Alias Cycle 5 — mesma entidade persistida no snapshot. */
export type DecisionAlert = Alert
