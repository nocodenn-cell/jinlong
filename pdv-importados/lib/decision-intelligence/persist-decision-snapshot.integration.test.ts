import { describe, expect, it, vi } from 'vitest'
import {
  WAVE_A_DESCRIPTORS,
  createInMemoryFactProvider,
  envelopeStub,
  runEngineLoop,
  type DecisionSnapshot,
} from '@shared-core/src/intelligence'
import { createInMemoryDecisionSnapshotRepository } from './adapters/in-memory-decision-snapshot-repository'
import {
  DI_CORE_SNAPSHOT_VERSION,
  DI_SNAPSHOT_SCHEMA_VERSION,
} from './constants'
import {
  persistDecisionSnapshot,
  persistDecisionSnapshotAsync,
} from './persist-decision-snapshot'
import { createSupabaseDecisionSnapshotRepository } from './adapters/supabase-decision-snapshot-repository'
import {
  decodeDecisionSnapshotPayload,
  encodeDecisionSnapshotPayload,
} from './snapshot-codec'

async function sampleSnapshot(): Promise<DecisionSnapshot> {
  return runEngineLoop({
    storeId: 'loja-persist-1',
    providers: [
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [
        envelopeStub({
          factId: 'SaleFact',
          owner: 'sales',
          readiness: 'READY',
          storeId: 'loja-persist-1',
          confidence: 'HIGH',
          operationalConfidence: 1,
          inputFingerprint: 'sale:persist',
        }),
      ]),
    ],
    now: () => new Date('2026-07-19T20:00:00.000Z'),
  })
}

describe('Decision Intelligence Persistência (Fase 1)', () => {
  it('codec round-trip preserva storeId e timestamp', async () => {
    const snapshot = await sampleSnapshot()
    const encoded = encodeDecisionSnapshotPayload(snapshot)
    expect(encoded.schemaVersion).toBe(DI_SNAPSHOT_SCHEMA_VERSION)
    const decoded = decodeDecisionSnapshotPayload(encoded)
    expect(decoded?.storeId).toBe('loja-persist-1')
    expect(decoded?.timestamp).toBe('2026-07-19T20:00:00.000Z')
    expect(decoded?.executive.ruleId).toBe('EXECUTIVE_COMPOSE')
  })

  it('Engine Loop → repository in-memory → leitura', async () => {
    const snapshot = await sampleSnapshot()
    const repo = createInMemoryDecisionSnapshotRepository()

    const saved = await persistDecisionSnapshot({ repository: repo, snapshot })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const latest = await repo.findLatestByLoja('loja-persist-1')
    expect(latest).not.toBeNull()
    expect(latest?.id).toBe(saved.id)
    expect(latest?.snapshotVersion).toBe(DI_CORE_SNAPSHOT_VERSION)
    expect(latest?.schemaVersion).toBe(DI_SNAPSHOT_SCHEMA_VERSION)
    expect(latest?.payload.storeId).toBe(snapshot.storeId)
    expect(latest?.payload.memory.ruleId).toBe('MEMORY_PIPELINE_EMISSION')
  })

  it('persistência assíncrona não bloqueia e registra erros via callback', async () => {
    const snapshot = await sampleSnapshot()
    const repo = createInMemoryDecisionSnapshotRepository()
    const onError = vi.fn()

    persistDecisionSnapshotAsync({ repository: repo, snapshot, onError })

    await vi.waitFor(async () => {
      const latest = await repo.findLatestByLoja('loja-persist-1')
      expect(latest).not.toBeNull()
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('adapter Supabase mapeia insert e erros sem lógica de negócio', async () => {
    const snapshot = await sampleSnapshot()
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({
          data: { id: '11111111-1111-1111-1111-111111111111' },
          error: null,
        }),
      }),
    })
    const supabase = {
      from: vi.fn().mockReturnValue({ insert }),
    }

    const repo = createSupabaseDecisionSnapshotRepository(
      supabase as never,
    )
    const result = await persistDecisionSnapshot({ repository: repo, snapshot })
    expect(result).toEqual({
      ok: true,
      id: '11111111-1111-1111-1111-111111111111',
    })
    expect(supabase.from).toHaveBeenCalledWith('decision_snapshots')
    expect(insert).toHaveBeenCalled()
    const row = insert.mock.calls[0]?.[0]
    expect(row.loja_id).toBe('loja-persist-1')
    expect(row.snapshot_version).toBe(DI_CORE_SNAPSHOT_VERSION)
    expect(row.payload.schemaVersion).toBe(DI_SNAPSHOT_SCHEMA_VERSION)
  })
})
