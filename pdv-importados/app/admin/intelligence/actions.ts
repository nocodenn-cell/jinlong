'use server'

import { revalidatePath } from 'next/cache'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import {
  registrarDecisaoIntelligence,
  type RegistrarDecisaoResult,
} from '@/lib/admin/intelligence/registrarDecisao'
import { createClient } from '@/lib/supabase/server'
import type { DecisionReasonCode, DecisionRecordStatus } from '@/lib/decision-intelligence'
import { ROUTES } from '@shared-core/navigation/routes'

export type { RegistrarDecisaoResult }

export type RegistrarDecisaoActionInput = {
  recommendationId: string
  status: DecisionRecordStatus
  decisionReason: DecisionReasonCode
  notes?: string | null
  reviewDate?: string | null
}

/**
 * Server Action thin — auth + revalidate.
 * Persistência em lib/admin/intelligence/registrarDecisao.
 */
export async function registrarDecisaoIntelligenceAction(
  input: RegistrarDecisaoActionInput,
): Promise<RegistrarDecisaoResult> {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.intelligence,
    resource: `route:${ROUTES.admin.intelligence}`,
  })

  const lojaId = session.lojaId?.trim()
  if (!lojaId) {
    return { ok: false, code: 'DI_NO_STORE', message: 'Sessão sem loja' }
  }

  const supabase = await createClient()
  const result = await registrarDecisaoIntelligence(supabase, {
    lojaId,
    userId: session.userId,
    recommendationId: input.recommendationId,
    status: input.status,
    decisionReason: input.decisionReason,
    notes: input.notes,
    reviewDate: input.reviewDate,
  })

  if (result.ok) revalidatePath(ROUTES.admin.intelligence)
  return result
}
