import { createClient } from '@/lib/supabase/server'
import {
  createDecisionReadModelAdapter,
  createSupabaseDecisionRecordRepository,
  createSupabaseDecisionSnapshotRepository,
  type DecisionIntelligenceReadModel,
  type DecisionReadModelPort,
} from '@/lib/decision-intelligence'

/**
 * Serviço de leitura do cockpit — única porta de dados para `/admin/intelligence`.
 * Consome exclusivamente `DecisionReadModelPort` (projeções).
 * Não recalcula KPIs/Findings/Recommendations/Alerts/Action Plans.
 */
export async function loadIntelligenceReadModel(
  lojaId: string,
  port?: DecisionReadModelPort,
): Promise<DecisionIntelligenceReadModel | null> {
  if (!lojaId.trim()) return null
  if (port) return port.getForLoja(lojaId)

  const supabase = await createClient()
  const readModel = createDecisionReadModelAdapter({
    snapshots: createSupabaseDecisionSnapshotRepository(supabase),
    decisions: createSupabaseDecisionRecordRepository(supabase),
  })
  return readModel.getForLoja(lojaId)
}
