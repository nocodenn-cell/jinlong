import type { FactEnvelope } from '../contracts/fact'
import type { FactProviderDescriptor } from '../contracts/provider-support'
import type { FactId } from '../facts/definitions'
import type { TimeWindow } from '../types/common'

/**
 * Outbound port — Cycle 0 tipagem; Cycle 1 implementa na app.
 * DI não conhece Supabase / SQL / Next.
 *
 * Todo provider DEVE expor `descriptor` com:
 * - supportLevel (estrutural)
 * - operationalConfidence ∈ [0,1] (qualidade prática)
 * - wave (A | B | CONTEXT | DEFERRED)
 */

export type FactQuery = {
  storeId: string
  window?: TimeWindow
  factIds?: readonly FactId[]
}

export type FactProviderPort = {
  /** Declaração obrigatória de qualidade / gates / dependências. */
  readonly descriptor: FactProviderDescriptor
  /**
   * Lê Facts canônicos. Adapters respeitam gates
   * (`isFactProviderIoAllowed`, `evaluateFactConsumption`,
   * `evaluateProviderForRecommendation`).
   */
  load(query: FactQuery): Promise<readonly FactEnvelope[]>
}
