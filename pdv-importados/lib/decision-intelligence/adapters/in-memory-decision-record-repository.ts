import {
  EMPTY_TIMED_OUTCOMES,
  type DecisionRecord,
  type DecisionRecordCreateInput,
  type DecisionRecordOutcomePatch,
} from '../models/decision-record'
import type {
  DecisionRecordRepositoryPort,
  DecisionRecordSaveResult,
} from '../ports/decision-record-repository'

function newId(): string {
  return `mem-dec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createInMemoryDecisionRecordRepository(): DecisionRecordRepositoryPort & {
  _all(): readonly DecisionRecord[]
} {
  const rows: DecisionRecord[] = []

  return {
    _all() {
      return rows
    },

    async create(
      input: DecisionRecordCreateInput,
    ): Promise<DecisionRecordSaveResult> {
      if (!input.lojaId || !input.recommendationId) {
        return {
          ok: false,
          code: 'DI_DECISION_INVALID',
          message: 'lojaId e recommendationId são obrigatórios',
        }
      }
      const now = new Date().toISOString()
      const id = newId()
      const record: DecisionRecord = {
        id,
        lojaId: input.lojaId,
        recommendationId: input.recommendationId,
        snapshotId: input.snapshotId ?? null,
        status: input.status,
        decisionReason: input.decisionReason,
        decisionAt: input.decisionAt ?? now,
        actorId: input.actorId ?? null,
        reviewDate: input.reviewDate ?? null,
        expectedOutcome: input.expectedOutcome ?? null,
        actualOutcome: input.actualOutcome ?? null,
        outcomes: input.outcomes ?? { ...EMPTY_TIMED_OUTCOMES },
        actionPlanItemIds: input.actionPlanItemIds ?? [],
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      }
      rows.push(record)
      return { ok: true, id }
    },

    async updateOutcomes(
      id: string,
      patch: DecisionRecordOutcomePatch,
    ): Promise<DecisionRecordSaveResult> {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx < 0) {
        return {
          ok: false,
          code: 'DI_DECISION_NOT_FOUND',
          message: `DecisionRecord ${id} não encontrado`,
        }
      }
      const prev = rows[idx]!
      const next: DecisionRecord = {
        ...prev,
        actualOutcome:
          patch.actualOutcome !== undefined
            ? patch.actualOutcome
            : prev.actualOutcome,
        outcomes: patch.outcomes
          ? {
              d30: patch.outcomes.d30 ?? prev.outcomes.d30,
              d60: patch.outcomes.d60 ?? prev.outcomes.d60,
              d90: patch.outcomes.d90 ?? prev.outcomes.d90,
            }
          : prev.outcomes,
        status: patch.status ?? prev.status,
        reviewDate:
          patch.reviewDate !== undefined ? patch.reviewDate : prev.reviewDate,
        notes: patch.notes !== undefined ? patch.notes : prev.notes,
        updatedAt: new Date().toISOString(),
      }
      rows[idx] = next
      return { ok: true, id }
    },

    async findById(id: string): Promise<DecisionRecord | null> {
      return rows.find((r) => r.id === id) ?? null
    },

    async findByRecommendationId(
      recommendationId: string,
    ): Promise<readonly DecisionRecord[]> {
      return rows.filter((r) => r.recommendationId === recommendationId)
    },

    async listByLoja(
      lojaId: string,
      limit = 50,
    ): Promise<readonly DecisionRecord[]> {
      return rows
        .filter((r) => r.lojaId === lojaId)
        .sort((a, b) => b.decisionAt.localeCompare(a.decisionAt))
        .slice(0, limit)
    },
  }
}
