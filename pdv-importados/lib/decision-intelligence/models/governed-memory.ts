import type { DecisionReasonCode, DecisionRecordStatus } from './decision-record'

/**
 * Entrada de Memory governada — outcomes humanos.
 * Fora do Core. Não altera regras automaticamente. Sem IA.
 */

export type GovernedMemoryEventKind =
  | 'DECISION_RECORDED'
  | 'OUTCOME_RECORDED'
  | 'TIMED_OUTCOME_RECORDED'

export type GovernedMemoryEntry = {
  id: string
  lojaId: string
  decisionId: string
  recommendationId: string
  eventKind: GovernedMemoryEventKind
  decisionStatus: DecisionRecordStatus
  decisionReason: DecisionReasonCode
  /** Codes estáveis para auditoria — sem texto livre de regra. */
  noteCodes: readonly string[]
  metricCode: string | null
  expectedValue: number | null
  actualValue: number | null
  recordedAt: string
  actorId: string | null
}

export type GovernedMemoryCreateInput = {
  lojaId: string
  decisionId: string
  recommendationId: string
  eventKind: GovernedMemoryEventKind
  decisionStatus: DecisionRecordStatus
  decisionReason: DecisionReasonCode
  noteCodes: readonly string[]
  metricCode?: string | null
  expectedValue?: number | null
  actualValue?: number | null
  recordedAt?: string
  actorId?: string | null
}
