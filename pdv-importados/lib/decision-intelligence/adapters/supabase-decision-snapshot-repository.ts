import type { SupabaseClient } from '@supabase/supabase-js'
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

type DecisionSnapshotRow = {
  id: string
  loja_id: string
  snapshot_version: string
  schema_version: number
  requested_at: string
  persisted_at: string
  pipeline_fingerprint: string | null
  payload: unknown
}

function mapRow(row: DecisionSnapshotRow): DecisionSnapshotRecord | null {
  const payload = decodeDecisionSnapshotPayload(row.payload)
  if (!payload) return null
  return {
    id: row.id,
    lojaId: row.loja_id,
    snapshotVersion: row.snapshot_version,
    schemaVersion: row.schema_version,
    requestedAt: row.requested_at,
    persistedAt: row.persisted_at,
    pipelineFingerprint: row.pipeline_fingerprint,
    payload,
  }
}

/**
 * Adapter Supabase — apenas I/O. Sem regras de Decision Intelligence.
 */
export function createSupabaseDecisionSnapshotRepository(
  supabase: SupabaseClient,
): DecisionSnapshotRepositoryPort {
  return {
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

      const { data, error } = await supabase
        .from('decision_snapshots')
        .insert({
          loja_id: snapshot.storeId,
          snapshot_version: meta.snapshotVersion,
          schema_version: meta.schemaVersion,
          requested_at: snapshot.timestamp,
          pipeline_fingerprint: extractPipelineFingerprint(snapshot),
          payload: envelope,
        })
        .select('id')
        .single()

      if (error || !data?.id) {
        return {
          ok: false,
          code: 'DI_PERSIST_SUPABASE',
          message: error?.message ?? 'Insert decision_snapshots sem id',
        }
      }
      return { ok: true, id: String(data.id) }
    },

    async findById(id: string): Promise<DecisionSnapshotRecord | null> {
      const { data, error } = await supabase
        .from('decision_snapshots')
        .select(
          'id, loja_id, snapshot_version, schema_version, requested_at, persisted_at, pipeline_fingerprint, payload',
        )
        .eq('id', id)
        .maybeSingle()

      if (error || !data) return null
      return mapRow(data as DecisionSnapshotRow)
    },

    async findLatestByLoja(
      lojaId: string,
    ): Promise<DecisionSnapshotRecord | null> {
      const { data, error } = await supabase
        .from('decision_snapshots')
        .select(
          'id, loja_id, snapshot_version, schema_version, requested_at, persisted_at, pipeline_fingerprint, payload',
        )
        .eq('loja_id', lojaId)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error || !data) return null
      return mapRow(data as DecisionSnapshotRow)
    },
  }
}
