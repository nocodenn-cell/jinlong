import type { DecisionSnapshot } from '@shared-core/src/intelligence'
import {
  DI_CORE_SNAPSHOT_VERSION,
  DI_SNAPSHOT_SCHEMA_VERSION,
} from './constants'
import type {
  DecisionSnapshotPersistMeta,
  DecisionSnapshotRepositoryPort,
  DecisionSnapshotSaveResult,
} from './ports/decision-snapshot-repository'

export type PersistDecisionSnapshotOptions = {
  repository: DecisionSnapshotRepositoryPort
  snapshot: DecisionSnapshot
  meta?: Partial<DecisionSnapshotPersistMeta>
  /** Chamado em falha da persistência assíncrona (nunca lança para o caller). */
  onError?: (result: Extract<DecisionSnapshotSaveResult, { ok: false }>) => void
}

function resolveMeta(
  partial?: Partial<DecisionSnapshotPersistMeta>,
): DecisionSnapshotPersistMeta {
  return {
    snapshotVersion: partial?.snapshotVersion ?? DI_CORE_SNAPSHOT_VERSION,
    schemaVersion: partial?.schemaVersion ?? DI_SNAPSHOT_SCHEMA_VERSION,
    traceId: partial?.traceId,
  }
}

/** Persistência síncrona (testes / jobs controlados). */
export async function persistDecisionSnapshot(
  options: PersistDecisionSnapshotOptions,
): Promise<DecisionSnapshotSaveResult> {
  return options.repository.save(
    options.snapshot,
    resolveMeta(options.meta),
  )
}

/**
 * Persistência assíncrona — não bloqueia o Engine Loop.
 * Falha de I/O não propaga para o caller do loop.
 */
export function persistDecisionSnapshotAsync(
  options: PersistDecisionSnapshotOptions,
): void {
  void persistDecisionSnapshot(options).then((result) => {
    if (!result.ok) {
      options.onError?.(result)
    }
  })
}
