import type { KpiValue } from './kpi'

/**
 * Decision Memory Contract — ADR-011.
 * Registra: emissão → decisão → execução → outcomes 30/60/90.
 * Cycle 0: contrato apenas.
 */

export type DecisionKind = 'ACCEPTED' | 'DISMISSED' | 'SNOOZED'

export type ExecutionStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED' | 'PARTIAL'

export type Effectiveness =
  | 'IMPROVED'
  | 'NEUTRAL'
  | 'WORSE'
  | 'INCONCLUSIVE'
  | 'PENDING'

export type OutcomeSnapshot = {
  measuredAt: string
  kpiValues: readonly KpiValue[]
  /** Mesmos kpiId/formulaVersion da emissão, ou flag de drift. */
  formulaDrift: boolean
}

export type OutcomeSlot = OutcomeSnapshot | { status: 'PENDING' }

export type DecisionExecution = {
  status: ExecutionStatus
  completedAt?: string
  notesCode?: string
  deepLinkUsed?: string
}

export type DecisionRecord = {
  id: string
  recommendationId: string
  actionPlanItemIds: readonly string[]
  decision: DecisionKind
  decisionAt: string
  actorId: string
  reasonCodes: readonly string[]
  execution: DecisionExecution
  /** Baselines dos KPIs-alvo na emissão */
  baselines: readonly KpiValue[]
  outcomes: {
    d30: OutcomeSlot
    d60: OutcomeSlot
    d90: OutcomeSlot
  }
  effectiveness: Effectiveness
}
