import type { ConfidenceLevel, OperationalConfidence } from '../types/common'
import type { FactId, FactOwnerDomain, FactReadiness } from '../facts/definitions'

/**
 * Envelope canônico de Fact.
 * Payloads tipados por FactId — Cycle 1 providers.
 * Sem SQL neste pacote.
 */

export type FactEnvelope<TPayload = unknown> = {
  factId: FactId
  owner: FactOwnerDomain
  readiness: FactReadiness
  storeId?: string
  observedAt: string
  inputFingerprint: string
  /** Nível categórico (HIGH/MEDIUM/LOW/UNSUPPORTED) — compat Cycle 0. */
  confidence: ConfidenceLevel
  /**
   * Confiança operacional ∈ [0, 1] desta carga.
   * Distinto de supportLevel do provider (estrutural).
   */
  operationalConfidence: OperationalConfidence
  /** Gates que degradam este fato — ver gates/data-readiness. */
  affectedByGateIds?: readonly string[]
  payload: TPayload
}

/** Metadado de registro (sem payload). */
export type FactRegistryEntry = {
  factId: FactId
  owner: FactOwnerDomain
  readiness: FactReadiness
  /** Gates que afetam consumo deste Fact. */
  gateIds: readonly string[]
  descriptionCode: string
}
