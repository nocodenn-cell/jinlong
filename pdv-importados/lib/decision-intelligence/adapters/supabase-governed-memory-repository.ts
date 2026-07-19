import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GovernedMemoryCreateInput,
  GovernedMemoryEntry,
} from '../models/governed-memory'
import type {
  GovernedMemoryRepositoryPort,
  GovernedMemorySaveResult,
} from '../ports/governed-memory-repository'

type Row = {
  id: string
  loja_id: string
  decision_id: string
  recommendation_id: string
  event_kind: GovernedMemoryEntry['eventKind']
  decision_status: GovernedMemoryEntry['decisionStatus']
  decision_reason: GovernedMemoryEntry['decisionReason']
  note_codes: string[] | null
  metric_code: string | null
  expected_value: number | string | null
  actual_value: number | string | null
  recorded_at: string
  actor_id: string | null
}

function mapRow(row: Row): GovernedMemoryEntry {
  return {
    id: row.id,
    lojaId: row.loja_id,
    decisionId: row.decision_id,
    recommendationId: row.recommendation_id,
    eventKind: row.event_kind,
    decisionStatus: row.decision_status,
    decisionReason: row.decision_reason,
    noteCodes: row.note_codes ?? [],
    metricCode: row.metric_code,
    expectedValue:
      row.expected_value == null ? null : Number(row.expected_value),
    actualValue: row.actual_value == null ? null : Number(row.actual_value),
    recordedAt: row.recorded_at,
    actorId: row.actor_id,
  }
}

export function createSupabaseGovernedMemoryRepository(
  supabase: SupabaseClient,
): GovernedMemoryRepositoryPort {
  return {
    async append(input: GovernedMemoryCreateInput): Promise<GovernedMemorySaveResult> {
      const { data, error } = await supabase
        .from('decision_governed_memory')
        .insert({
          loja_id: input.lojaId,
          decision_id: input.decisionId,
          recommendation_id: input.recommendationId,
          event_kind: input.eventKind,
          decision_status: input.decisionStatus,
          decision_reason: input.decisionReason,
          note_codes: [...input.noteCodes],
          metric_code: input.metricCode ?? null,
          expected_value: input.expectedValue ?? null,
          actual_value: input.actualValue ?? null,
          recorded_at: input.recordedAt ?? new Date().toISOString(),
          actor_id: input.actorId ?? null,
        })
        .select('id')
        .single()

      if (error || !data?.id) {
        return {
          ok: false,
          code: 'DI_GOV_MEMORY_SUPABASE',
          message: error?.message ?? 'insert failed',
        }
      }
      return { ok: true, id: data.id as string }
    },

    async listByLoja(lojaId: string, limit = 200) {
      const { data, error } = await supabase
        .from('decision_governed_memory')
        .select('*')
        .eq('loja_id', lojaId)
        .order('recorded_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(`DI_GOV_MEMORY_LIST: ${error.message}`)
      return (data ?? []).map((row) => mapRow(row as Row))
    },

    async listByDecisionId(decisionId: string) {
      const { data, error } = await supabase
        .from('decision_governed_memory')
        .select('*')
        .eq('decision_id', decisionId)
        .order('recorded_at', { ascending: false })
      if (error) throw new Error(`DI_GOV_MEMORY_BY_DEC: ${error.message}`)
      return (data ?? []).map((row) => mapRow(row as Row))
    },
  }
}
