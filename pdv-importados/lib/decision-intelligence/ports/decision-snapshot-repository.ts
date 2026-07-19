import type { DecisionSnapshot } from '@shared-core/src/intelligence'

/**
 * Porta de persistência — fora do Core.
 * Adapter faz I/O; Core permanece independente.
 */

export type DecisionSnapshotPersistMeta = {
  snapshotVersion: string
  schemaVersion: number
  /** Observabilidade futura (Fase 6); opcional na Fase 1. */
  traceId?: string
}

export type DecisionSnapshotRecord = {
  id: string
  lojaId: string
  snapshotVersion: string
  schemaVersion: number
  requestedAt: string
  persistedAt: string
  pipelineFingerprint: string | null
  payload: DecisionSnapshot
}

export type DecisionSnapshotSaveResult =
  | { ok: true; id: string }
  | { ok: false; code: string; message: string }

export type DecisionSnapshotRepositoryPort = {
  save(
    snapshot: DecisionSnapshot,
    meta: DecisionSnapshotPersistMeta,
  ): Promise<DecisionSnapshotSaveResult>
  findById(id: string): Promise<DecisionSnapshotRecord | null>
  findLatestByLoja(lojaId: string): Promise<DecisionSnapshotRecord | null>
}
