import type { SupabaseClient } from '@supabase/supabase-js'
import {
  mapDecisionRecordRow,
  toInsertRow,
  type DecisionRecordRow,
} from '../decision-record-mapper'
import type {
  DecisionRecord,
  DecisionRecordCreateInput,
  DecisionRecordOutcomePatch,
} from '../models/decision-record'
import type {
  DecisionRecordRepositoryPort,
  DecisionRecordSaveResult,
} from '../ports/decision-record-repository'

const SELECT_COLS =
  'id, loja_id, recommendation_id, snapshot_id, status, decision_reason, decision_at, actor_id, review_date, expected_outcome, actual_outcome, outcomes, action_plan_item_ids, notes, created_at, updated_at'

/**
 * Adapter Supabase — I/O apenas. Sem avaliar Recommendation nem outcomes.
 */
export function createSupabaseDecisionRecordRepository(
  supabase: SupabaseClient,
): DecisionRecordRepositoryPort {
  return {
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

      const { data, error } = await supabase
        .from('decision_records')
        .insert(toInsertRow(input))
        .select('id')
        .single()

      if (error || !data?.id) {
        return {
          ok: false,
          code: 'DI_DECISION_SUPABASE',
          message: error?.message ?? 'Insert decision_records sem id',
        }
      }
      return { ok: true, id: String(data.id) }
    },

    async updateOutcomes(
      id: string,
      patch: DecisionRecordOutcomePatch,
    ): Promise<DecisionRecordSaveResult> {
      const update: Record<string, unknown> = {}
      if (patch.actualOutcome !== undefined) {
        update.actual_outcome = patch.actualOutcome
      }
      if (patch.outcomes !== undefined) {
        const current = await this.findById(id)
        if (!current) {
          return {
            ok: false,
            code: 'DI_DECISION_NOT_FOUND',
            message: `DecisionRecord ${id} não encontrado`,
          }
        }
        update.outcomes = {
          d30: patch.outcomes.d30 ?? current.outcomes.d30,
          d60: patch.outcomes.d60 ?? current.outcomes.d60,
          d90: patch.outcomes.d90 ?? current.outcomes.d90,
        }
      }
      if (patch.status !== undefined) update.status = patch.status
      if (patch.reviewDate !== undefined) update.review_date = patch.reviewDate
      if (patch.notes !== undefined) update.notes = patch.notes

      if (Object.keys(update).length === 0) {
        return { ok: true, id }
      }

      const { error } = await supabase
        .from('decision_records')
        .update(update)
        .eq('id', id)

      if (error) {
        return {
          ok: false,
          code: 'DI_DECISION_SUPABASE',
          message: error.message,
        }
      }
      return { ok: true, id }
    },

    async findById(id: string): Promise<DecisionRecord | null> {
      const { data, error } = await supabase
        .from('decision_records')
        .select(SELECT_COLS)
        .eq('id', id)
        .maybeSingle()
      if (error || !data) return null
      return mapDecisionRecordRow(data as DecisionRecordRow)
    },

    async findByRecommendationId(
      recommendationId: string,
    ): Promise<readonly DecisionRecord[]> {
      const { data, error } = await supabase
        .from('decision_records')
        .select(SELECT_COLS)
        .eq('recommendation_id', recommendationId)
        .order('decision_at', { ascending: false })
      if (error || !data) return []
      return (data as DecisionRecordRow[]).map(mapDecisionRecordRow)
    },

    async listByLoja(
      lojaId: string,
      limit = 50,
    ): Promise<readonly DecisionRecord[]> {
      const { data, error } = await supabase
        .from('decision_records')
        .select(SELECT_COLS)
        .eq('loja_id', lojaId)
        .order('decision_at', { ascending: false })
        .limit(limit)
      if (error || !data) return []
      return (data as DecisionRecordRow[]).map(mapDecisionRecordRow)
    },
  }
}
