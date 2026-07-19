import {
  EMPTY_TIMED_OUTCOMES,
  type DecisionRecord,
  type DecisionRecordCreateInput,
  type DecisionTimedOutcomes,
  type MeasurableOutcome,
} from './models/decision-record'

export type DecisionRecordRow = {
  id: string
  loja_id: string
  recommendation_id: string
  snapshot_id: string | null
  status: string
  decision_reason: string
  decision_at: string
  actor_id: string | null
  review_date: string | null
  expected_outcome: unknown
  actual_outcome: unknown
  outcomes: unknown
  action_plan_item_ids: string[] | null
  notes: string | null
  created_at: string
  updated_at: string
}

function asMeasurable(raw: unknown): MeasurableOutcome | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.metricCode !== 'string' || typeof o.value !== 'number') {
    return null
  }
  return {
    metricCode: o.metricCode,
    value: o.value,
    unit: typeof o.unit === 'string' ? o.unit : undefined,
    descriptionCode:
      typeof o.descriptionCode === 'string' ? o.descriptionCode : undefined,
    measuredAt: typeof o.measuredAt === 'string' ? o.measuredAt : undefined,
  }
}

function asTimedOutcomes(raw: unknown): DecisionTimedOutcomes {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_TIMED_OUTCOMES }
  const o = raw as Record<string, unknown>
  const slot = (key: 'd30' | 'd60' | 'd90') => {
    const s = o[key]
    if (!s || typeof s !== 'object') return { status: 'PENDING' as const }
    const slotObj = s as Record<string, unknown>
    if (slotObj.status === 'RECORDED' && slotObj.actual) {
      const actual = asMeasurable(slotObj.actual)
      if (actual && typeof slotObj.measuredAt === 'string') {
        return {
          status: 'RECORDED' as const,
          measuredAt: slotObj.measuredAt,
          actual,
        }
      }
    }
    return { status: 'PENDING' as const }
  }
  return { d30: slot('d30'), d60: slot('d60'), d90: slot('d90') }
}

export function mapDecisionRecordRow(row: DecisionRecordRow): DecisionRecord {
  return {
    id: row.id,
    lojaId: row.loja_id,
    recommendationId: row.recommendation_id,
    snapshotId: row.snapshot_id,
    status: row.status as DecisionRecord['status'],
    decisionReason: row.decision_reason as DecisionRecord['decisionReason'],
    decisionAt: row.decision_at,
    actorId: row.actor_id,
    reviewDate: row.review_date,
    expectedOutcome: asMeasurable(row.expected_outcome),
    actualOutcome: asMeasurable(row.actual_outcome),
    outcomes: asTimedOutcomes(row.outcomes),
    actionPlanItemIds: row.action_plan_item_ids ?? [],
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toInsertRow(input: DecisionRecordCreateInput): Record<string, unknown> {
  return {
    loja_id: input.lojaId,
    recommendation_id: input.recommendationId,
    snapshot_id: input.snapshotId ?? null,
    status: input.status,
    decision_reason: input.decisionReason,
    decision_at: input.decisionAt ?? new Date().toISOString(),
    actor_id: input.actorId ?? null,
    review_date: input.reviewDate ?? null,
    expected_outcome: input.expectedOutcome ?? null,
    actual_outcome: input.actualOutcome ?? null,
    outcomes: input.outcomes ?? EMPTY_TIMED_OUTCOMES,
    action_plan_item_ids: [...(input.actionPlanItemIds ?? [])],
    notes: input.notes ?? null,
  }
}
