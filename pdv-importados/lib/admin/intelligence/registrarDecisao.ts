import {
  createSupabaseDecisionRecordRepository,
  createSupabaseGovernedMemoryRepository,
  recordGovernedMemoryFromDecision,
  type DecisionReasonCode,
  type DecisionRecordStatus,
} from '@/lib/decision-intelligence'
import type { SupabaseClient } from '@supabase/supabase-js'

export type RegistrarDecisaoInput = {
  lojaId: string
  userId: string | null
  recommendationId: string
  status: DecisionRecordStatus
  decisionReason: DecisionReasonCode
  notes?: string | null
  reviewDate?: string | null
}

export type RegistrarDecisaoResult =
  | { ok: true; decisionId: string }
  | { ok: false; code: string; message: string }

/**
 * Serviço — registra DecisionRecord + Memory governada.
 * Fora da UI de apresentação; sem regras de Recommendation.
 */
export async function registrarDecisaoIntelligence(
  supabase: SupabaseClient,
  input: RegistrarDecisaoInput,
): Promise<RegistrarDecisaoResult> {
  if (!input.lojaId.trim()) {
    return { ok: false, code: 'DI_NO_STORE', message: 'lojaId obrigatório' }
  }
  if (!input.recommendationId.trim()) {
    return {
      ok: false,
      code: 'DI_NO_REC',
      message: 'recommendationId obrigatório',
    }
  }

  const decisions = createSupabaseDecisionRecordRepository(supabase)
  const memory = createSupabaseGovernedMemoryRepository(supabase)

  const created = await decisions.create({
    lojaId: input.lojaId,
    recommendationId: input.recommendationId.trim(),
    status: input.status,
    decisionReason: input.decisionReason,
    actorId: input.userId,
    notes: input.notes ?? null,
    reviewDate: input.reviewDate ?? null,
  })

  if (!created.ok) {
    return { ok: false, code: created.code, message: created.message }
  }

  const record = await decisions.findById(created.id)
  if (record) {
    await recordGovernedMemoryFromDecision(memory, record, 'DECISION_RECORDED')
  }

  return { ok: true, decisionId: created.id }
}
