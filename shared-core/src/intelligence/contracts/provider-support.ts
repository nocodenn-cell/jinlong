import type { FactId, FactOwnerDomain } from '../facts/definitions'
import type { DiGateId } from '../gates/data-readiness'
import type { OperationalConfidence, OperationalDomain } from '../types/common'

export type { OperationalConfidence }

/**
 * Nível de suporte do FactProvider (disponibilidade estrutural).
 *
 * SUPPORTED   — pode alimentar KPI/Recommendation com confidence alta
 * PARTIAL     — uso permitido só com confidence operacional limitada + limitations
 * UNSUPPORTED — não emitir recomendação que dependa deste Fact
 * DEPRECATED  — não usar em código novo; migrar consumidores
 */
export type FactProviderSupportLevel =
  | 'SUPPORTED'
  | 'PARTIAL'
  | 'UNSUPPORTED'
  | 'DEPRECATED'

/**
 * Descriptor obrigatório em todo FactProvider (Cycle 1).
 */
export type FactProviderDescriptor = {
  factId: FactId
  supportLevel: FactProviderSupportLevel
  /**
   * Confiança operacional estrutural / default do provider.
   * UNSUPPORTED ⇒ 0. PARTIAL tipicamente ≤ 0.72. SUPPORTED tipicamente 1.0.
   */
  operationalConfidence: OperationalConfidence
  /** Domínio(s) SSoT consultados via port/adapter. */
  dependencies: readonly OperationalDomain[] | readonly FactOwnerDomain[]
  /** Gates abertos que explicam PARTIAL/UNSUPPORTED. */
  gateIds: readonly DiGateId[]
  /** Code estável para UI */
  statusExplanationCode: string
  /** Onda do Cycle 1 */
  wave: 'A' | 'B' | 'CONTEXT' | 'DEFERRED'
}

export type RecommendationEligibility =
  | {
      ok: true
      maxConfidence: 'HIGH' | 'MEDIUM'
      maxOperationalConfidence: OperationalConfidence
    }
  | {
      ok: false
      reason: 'UNSUPPORTED' | 'DEPRECATED' | 'PARTIAL_BLOCKED_BY_POLICY' | 'CONFIDENCE_TOO_LOW'
      supportLevel: FactProviderSupportLevel
      factId: FactId
      messageCode: string
      gateIds: readonly DiGateId[]
      operationalConfidence: OperationalConfidence
    }

const PARTIAL_CONFIDENCE_CEILING = 0.72

/**
 * Recommendation Engine (Cycle 4) verifica supportLevel + confidence.
 */
export function evaluateProviderForRecommendation(
  descriptor: FactProviderDescriptor,
  options?: { minOperationalConfidence?: number },
): RecommendationEligibility {
  const { factId, supportLevel, gateIds, operationalConfidence } = descriptor
  const min = options?.minOperationalConfidence ?? 0

  if (supportLevel === 'UNSUPPORTED') {
    return {
      ok: false,
      reason: 'UNSUPPORTED',
      supportLevel,
      factId,
      messageCode: 'intel.rec.blocked_fact_unsupported',
      gateIds,
      operationalConfidence: 0,
    }
  }
  if (supportLevel === 'DEPRECATED') {
    return {
      ok: false,
      reason: 'DEPRECATED',
      supportLevel,
      factId,
      messageCode: 'intel.rec.blocked_fact_deprecated',
      gateIds,
      operationalConfidence,
    }
  }
  if (operationalConfidence < min) {
    return {
      ok: false,
      reason: 'CONFIDENCE_TOO_LOW',
      supportLevel,
      factId,
      messageCode: 'intel.rec.blocked_fact_confidence_low',
      gateIds,
      operationalConfidence,
    }
  }
  if (supportLevel === 'PARTIAL') {
    return {
      ok: true,
      maxConfidence: 'MEDIUM',
      maxOperationalConfidence: Math.min(operationalConfidence, PARTIAL_CONFIDENCE_CEILING),
    }
  }
  return {
    ok: true,
    maxConfidence: 'HIGH',
    maxOperationalConfidence: operationalConfidence,
  }
}

/** Defaults estruturais — providers podem reportar menor na carga. */
export function defaultOperationalConfidence(
  supportLevel: FactProviderSupportLevel,
): OperationalConfidence {
  switch (supportLevel) {
    case 'SUPPORTED':
      return 1
    case 'PARTIAL':
      return PARTIAL_CONFIDENCE_CEILING
    case 'UNSUPPORTED':
    case 'DEPRECATED':
      return 0
    default: {
      const _exhaustive: never = supportLevel
      return _exhaustive
    }
  }
}
