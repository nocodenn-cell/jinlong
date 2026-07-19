import type { OperationalConfidence } from '../types/common'

/**
 * Memory Snapshot — Cycle 7.
 * Puro, imutável, preparado para futura persistência.
 * Não escreve banco; não altera decisões anteriores do pipeline.
 */

export type MemoryEntryKind =
  | 'EMISSION'
  | 'CONTEXT'
  | 'LEARNING_HINT'

export type MemoryEntry = {
  id: string
  kind: MemoryEntryKind
  code: string
  relatedFindingIds: readonly string[]
  relatedRecommendationIds: readonly string[]
  relatedAlertIds: readonly string[]
  relatedActionPlanIds: readonly string[]
  noteCodes: readonly string[]
  operationalConfidence: OperationalConfidence
}

export type MemorySnapshot = {
  storeId: string
  recordedAt: string
  ruleId: string
  ruleVersion: string
  entries: readonly MemoryEntry[]
  /** Fingerprint do pipeline neste ciclo (auditável). */
  pipelineFingerprint: string
  operationalConfidence: OperationalConfidence
  sourceFindingIds: readonly string[]
  sourceRecommendationIds: readonly string[]
  sourceAlertIds: readonly string[]
  sourceActionPlanIds: readonly string[]
}
