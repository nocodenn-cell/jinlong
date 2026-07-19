/**
 * DecisionRecord — camada de integração (Fase 2).
 * Registra o que aconteceu DEPOIS da Recommendation.
 * Não é emissão de recomendação (isso é Core).
 *
 * Nota: distinto do stub ADR-011 em shared-core/contracts/decision-memory.ts
 * (Core congelado). Este modelo é o persistido em Postgres.
 */

export type DecisionRecordStatus =
  | 'accepted'
  | 'rejected'
  | 'deferred'
  | 'executed'

export type DecisionReasonCode =
  | 'HUMAN_OVERRIDE'
  | 'OUT_OF_STOCK'
  | 'BUSINESS_POLICY'
  | 'SEASONAL'
  | 'OTHER'

/** Meta ou resultado mensurável (sem recalcular KPI no adapter). */
export type MeasurableOutcome = {
  metricCode: string
  value: number
  unit?: string
  descriptionCode?: string
  measuredAt?: string
}

export type TimedOutcomeSlot =
  | { status: 'PENDING' }
  | {
      status: 'RECORDED'
      measuredAt: string
      actual: MeasurableOutcome
    }

export type DecisionTimedOutcomes = {
  d30: TimedOutcomeSlot
  d60: TimedOutcomeSlot
  d90: TimedOutcomeSlot
}

export const EMPTY_TIMED_OUTCOMES: DecisionTimedOutcomes = {
  d30: { status: 'PENDING' },
  d60: { status: 'PENDING' },
  d90: { status: 'PENDING' },
}

/**
 * Registro de decisão humana / operacional sobre uma Recommendation.
 */
export type DecisionRecord = {
  id: string
  lojaId: string
  recommendationId: string
  /** Snapshot de origem (opcional). */
  snapshotId: string | null
  status: DecisionRecordStatus
  decisionReason: DecisionReasonCode
  decisionAt: string
  actorId: string | null
  reviewDate: string | null
  expectedOutcome: MeasurableOutcome | null
  actualOutcome: MeasurableOutcome | null
  outcomes: DecisionTimedOutcomes
  actionPlanItemIds: readonly string[]
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** Input de criação — id/timestamps gerados na borda. */
export type DecisionRecordCreateInput = {
  lojaId: string
  recommendationId: string
  snapshotId?: string | null
  status: DecisionRecordStatus
  decisionReason: DecisionReasonCode
  decisionAt?: string
  actorId?: string | null
  reviewDate?: string | null
  expectedOutcome?: MeasurableOutcome | null
  actualOutcome?: MeasurableOutcome | null
  outcomes?: DecisionTimedOutcomes
  actionPlanItemIds?: readonly string[]
  notes?: string | null
}

export type DecisionRecordOutcomePatch = {
  actualOutcome?: MeasurableOutcome | null
  outcomes?: Partial<DecisionTimedOutcomes>
  status?: DecisionRecordStatus
  reviewDate?: string | null
  notes?: string | null
}
