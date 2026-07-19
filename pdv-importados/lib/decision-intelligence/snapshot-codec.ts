import type { DecisionSnapshot } from '@shared-core/src/intelligence'
import { DI_SNAPSHOT_SCHEMA_VERSION } from './constants'

/**
 * Codec puro — serializa/deserializa sem regras de negócio.
 * Deep-freeze do Core é quebrado apenas na cópia JSON (persistência).
 */

export type DecisionSnapshotPayloadEnvelope = {
  schemaVersion: number
  snapshot: DecisionSnapshot
}

export function encodeDecisionSnapshotPayload(
  snapshot: DecisionSnapshot,
  schemaVersion: number = DI_SNAPSHOT_SCHEMA_VERSION,
): DecisionSnapshotPayloadEnvelope {
  const cloned = JSON.parse(JSON.stringify(snapshot)) as DecisionSnapshot
  return {
    schemaVersion,
    snapshot: cloned,
  }
}

export function decodeDecisionSnapshotPayload(
  raw: unknown,
): DecisionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const envelope = raw as Partial<DecisionSnapshotPayloadEnvelope>
  if (
    typeof envelope.schemaVersion !== 'number' ||
    !envelope.snapshot ||
    typeof envelope.snapshot !== 'object'
  ) {
    return null
  }
  return envelope.snapshot as DecisionSnapshot
}

export function extractPipelineFingerprint(
  snapshot: DecisionSnapshot,
): string | null {
  const fp = snapshot.memory?.pipelineFingerprint
  return typeof fp === 'string' && fp.length > 0 ? fp : null
}
