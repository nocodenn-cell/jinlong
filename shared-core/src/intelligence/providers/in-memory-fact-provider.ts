import type { FactEnvelope } from '../contracts/fact'
import type { FactProviderDescriptor } from '../contracts/provider-support'
import type { FactProviderPort, FactQuery } from '../ports/fact-provider'

/**
 * Provider in-memory para validar o Engine Loop sem SQL/Supabase.
 * Adapters reais de I/O ficam na app (fora deste pacote).
 */
export function createInMemoryFactProvider(
  descriptor: FactProviderDescriptor,
  facts: readonly FactEnvelope[],
): FactProviderPort {
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      return facts
        .filter((f) => !f.storeId || f.storeId === query.storeId)
        .map((f) => ({ ...f, storeId: f.storeId ?? query.storeId }))
    },
  }
}

export function envelopeStub(
  partial: Pick<FactEnvelope, 'factId' | 'owner' | 'readiness'> &
    Partial<FactEnvelope>,
): FactEnvelope {
  return {
    factId: partial.factId,
    owner: partial.owner,
    readiness: partial.readiness,
    storeId: partial.storeId,
    observedAt: partial.observedAt ?? '2026-07-19T18:00:00.000Z',
    inputFingerprint: partial.inputFingerprint ?? `${partial.factId}:stub`,
    confidence: partial.confidence ?? 'HIGH',
    operationalConfidence: partial.operationalConfidence ?? 1,
    affectedByGateIds: partial.affectedByGateIds,
    payload: partial.payload ?? {},
  }
}
