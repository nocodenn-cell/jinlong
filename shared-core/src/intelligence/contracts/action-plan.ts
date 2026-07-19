import type { ConfidenceLevel, MoneyAmount, UrgencyTier } from '../types/common'

/**
 * Action Plan Contract — ADR-011.
 * Fluxo: Recommendation → Action Plan → Checklist → Execução → Resultado.
 * Cycle 0: contrato apenas.
 */

export type ActionPlanItemStatus = 'TODO' | 'DONE' | 'SKIPPED' | 'DEFERRED'

export type ActionPlanItem = {
  id: string
  /** Origem obrigatória */
  recommendationId: string
  titleCode: string
  actionCode: string
  checklistLabelCode: string
  urgency: UrgencyTier
  confidence: ConfidenceLevel
  estimatedImpact?: MoneyAmount
  deepLinkHint?: string
  status: ActionPlanItemStatus
  completedAt?: string
  actorId?: string
}

export type ActionPlan = {
  id: string
  storeId: string
  /** Data do plano (calendário da loja / ISO date). */
  planDate: string
  items: readonly ActionPlanItem[]
  createdAt: string
}
