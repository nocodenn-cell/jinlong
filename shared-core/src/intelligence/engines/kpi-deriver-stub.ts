import type { KpiInput } from '../contracts/pipeline-inputs'
import type { KpiValue } from '../contracts/kpi'
import { deriveKpis } from './kpi-derivation-engine'

/**
 * @deprecated Prefer `deriveKpis` (Cycle 2).
 * Mantido para compat: deriva a partir de facts do input (sem partial/blocked).
 */
export function deriveKpiInputStub(input: KpiInput): readonly KpiValue[] {
  return deriveKpis({
    storeId: input.storeId,
    factsUsed: input.facts,
    factsPartialIdentified: [],
    factsBlocked: [],
    requestedAt: input.requestedAt,
  }).kpiValues
}
