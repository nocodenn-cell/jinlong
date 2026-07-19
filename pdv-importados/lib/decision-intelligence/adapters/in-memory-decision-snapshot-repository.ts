import type { DecisionSnapshot } from '@shared-core/src/intelligence'
import {
  decodeDecisionSnapshotPayload,
  encodeDecisionSnapshotPayload,
  extractPipelineFingerprint,
} from '../snapshot-codec'
import type {
  DecisionSnapshotPersistMeta,
  DecisionSnapshotRecord,
  DecisionSnapshotRepositoryPort,
  DecisionSnapshotSaveResult,
} from '../ports/decision-snapshot-repository'

function newId(): string {
  return `mem-snap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Adapter in-memory — testes de integração sem Postgres.
 */
export function createInMemoryDecisionSnapshotRepository(): DecisionSnapshotRepositoryPort & {
  _all(): readonly DecisionSnapshotRecord[]
} {
  const rows: DecisionSnapshotRecord[] = []

  return {
    _all() {
      return rows
    },

    async save(
      snapshot: DecisionSnapshot,
      meta: DecisionSnapshotPersistMeta,
    ): Promise<DecisionSnapshotSaveResult> {
      if (!snapshot.storeId) {
        return {
          ok: false,
          code: 'DI_PERSIST_NO_STORE',
          message: 'DecisionSnapshot.storeId é obrigatório',
        }
      }
      const envelope = encodeDecisionSnapshotPayload(
        snapshot,
        meta.schemaVersion,
      )
      const decoded = decodeDecisionSnapshotPayload(envelope)
      if (!decoded) {
        return {
          ok: false,
          code: 'DI_PERSIST_CODEC',
          message: 'Falha ao codificar DecisionSnapshot',
        }
      }
      const id = newId()
      const record: DecisionSnapshotRecord = {
        id,
        lojaId: snapshot.storeId,
        snapshotVersion: meta.snapshotVersion,
        schemaVersion: meta.schemaVersion,
        requestedAt: snapshot.timestamp,
        persistedAt: new Date().toISOString(),
        pipelineFingerprint: extractPipelineFingerprint(snapshot),
        payload: decoded,
      }
      rows.push(record)
      return { ok: true, id }
    },

    async findById(id: string): Promise<DecisionSnapshotRecord | null> {
      return rows.find((r) => r.id === id) ?? null
    },

    async findLatestByLoja(
      lojaId: string,
    ): Promise<DecisionSnapshotRecord | null> {
      const forLoja = rows
        .filter((r) => r.lojaId === lojaId)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      return forLoja[0] ?? null
    },
  }
}
