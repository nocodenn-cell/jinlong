import { describe, expect, it, vi } from 'vitest'
import {
  WAVE_A_DESCRIPTORS,
  createInMemoryFactProvider,
  envelopeStub,
} from '@shared-core/src/intelligence'
import { createInMemoryDecisionRecordRepository } from '../adapters/in-memory-decision-record-repository'
import { createInMemoryDecisionSnapshotRepository } from '../adapters/in-memory-decision-snapshot-repository'
import { computeSnapshotContentFingerprint } from './content-fingerprint'
import { createEmptyWaveAProviders } from './create-empty-wave-a-providers'
import { runDecisionIntelligenceOrchestrator } from './run-orchestrator'
import { runStoreCycle } from './run-store-cycle'
import { authorizeOrchestratorRequest } from './auth-orchestrator-secret'

function saleProviders(storeId: string) {
  return [
    createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [
      envelopeStub({
        factId: 'SaleFact',
        owner: 'sales',
        readiness: 'READY',
        storeId,
        confidence: 'HIGH',
        operationalConfidence: 1,
        inputFingerprint: 'sale:orch:v1',
        payload: { grossAmount: 100, netAmount: 80 },
      }),
    ]),
    ...Object.values(WAVE_A_DESCRIPTORS)
      .filter((d) => d.factId !== 'SaleFact')
      .map((d) => createInMemoryFactProvider(d, [])),
  ]
}

describe('Decision Intelligence Orchestrator (Fase 5)', () => {
  it('executa Engine Loop, persiste snapshot e projeta Read Model', async () => {
    const snapshots = createInMemoryDecisionSnapshotRepository()
    const decisions = createInMemoryDecisionRecordRepository()

    const result = await runDecisionIntelligenceOrchestrator({
      trigger: 'manual',
      storeIds: ['loja-orch-1'],
      snapshots,
      decisions,
      providersFactory: (id) => saleProviders(id),
      logMetrics: false,
      now: () => new Date('2026-07-19T22:00:00.000Z'),
    })

    expect(result.ok).toBe(true)
    expect(result.metrics.snapshotsCreated).toBe(1)
    expect(result.metrics.snapshotsReused).toBe(0)
    expect(result.metrics.coreVersion).toBe('di-core-v1.0')
    expect(result.metrics.storeResults[0]?.readModel?.storeId).toBe('loja-orch-1')
    expect(snapshots._all()).toHaveLength(1)
  })

  it('reutiliza snapshot quando content fingerprint é idêntico (idempotência)', async () => {
    const snapshots = createInMemoryDecisionSnapshotRepository()
    const fixedNow = () => new Date('2026-07-19T22:00:00.000Z')

    const first = await runDecisionIntelligenceOrchestrator({
      trigger: 'scheduled',
      storeIds: ['loja-orch-2'],
      snapshots,
      providersFactory: (id) => saleProviders(id),
      logMetrics: false,
      now: fixedNow,
    })
    expect(first.metrics.snapshotsCreated).toBe(1)

    const second = await runDecisionIntelligenceOrchestrator({
      trigger: 'scheduled',
      storeIds: ['loja-orch-2'],
      snapshots,
      providersFactory: (id) => saleProviders(id),
      logMetrics: false,
      now: () => new Date('2026-07-19T23:00:00.000Z'),
    })

    expect(second.ok).toBe(true)
    expect(second.metrics.snapshotsCreated).toBe(0)
    expect(second.metrics.snapshotsReused).toBe(1)
    expect(snapshots._all()).toHaveLength(1)
    expect(second.metrics.storeResults[0]?.outcome).toBe('reused')
  })

  it('não corrompe snapshots existentes quando persist falha', async () => {
    const base = createInMemoryDecisionSnapshotRepository()
    const first = await runStoreCycle({
      storeId: 'loja-orch-3',
      providers: saleProviders('loja-orch-3'),
      snapshots: base,
      now: () => new Date('2026-07-19T22:00:00.000Z'),
    })
    expect(first.outcome).toBe('created')

    const failing = {
      save: vi.fn().mockResolvedValue({
        ok: false as const,
        code: 'DI_PERSIST_SUPABASE',
        message: 'boom',
      }),
      findById: base.findById.bind(base),
      findLatestByLoja: base.findLatestByLoja.bind(base),
    }

    const second = await runStoreCycle({
      storeId: 'loja-orch-3',
      providers: [
        createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [
          envelopeStub({
            factId: 'SaleFact',
            owner: 'sales',
            readiness: 'READY',
            storeId: 'loja-orch-3',
            inputFingerprint: 'sale:orch:v2',
            confidence: 'HIGH',
            operationalConfidence: 1,
            payload: { grossAmount: 200, netAmount: 160 },
          }),
        ]),
        ...Object.values(WAVE_A_DESCRIPTORS)
          .filter((d) => d.factId !== 'SaleFact')
          .map((d) => createInMemoryFactProvider(d, [])),
      ],
      snapshots: failing,
      persistRetries: 1,
      now: () => new Date('2026-07-19T22:30:00.000Z'),
    })

    expect(second.outcome).toBe('failed')
    expect(second.stage).toBe('persist')
    expect(failing.save).toHaveBeenCalledTimes(2)
    expect(base._all()).toHaveLength(1)
    expect(base._all()[0]?.id).toBe(first.snapshotId)
  })

  it('content fingerprint ignora timestamp do ciclo', async () => {
    const snapshots = createInMemoryDecisionSnapshotRepository()
    const a = await runStoreCycle({
      storeId: 'loja-orch-4',
      providers: saleProviders('loja-orch-4'),
      snapshots,
      now: () => new Date('2026-07-19T10:00:00.000Z'),
    })
    const b = await runStoreCycle({
      storeId: 'loja-orch-4',
      providers: saleProviders('loja-orch-4'),
      snapshots,
      now: () => new Date('2026-07-19T11:00:00.000Z'),
    })
    expect(a.contentFingerprint).toBe(b.contentFingerprint)
    expect(a.contentFingerprint).toBeTruthy()
    expect(b.outcome).toBe('reused')
  })

  it('createEmptyWaveAProviders não lança e permite ciclo', async () => {
    const snapshots = createInMemoryDecisionSnapshotRepository()
    const result = await runDecisionIntelligenceOrchestrator({
      trigger: 'manual',
      storeIds: ['loja-empty'],
      snapshots,
      providersFactory: () => createEmptyWaveAProviders(),
      logMetrics: false,
    })
    expect(result.ok).toBe(true)
    expect(result.metrics.snapshotsCreated).toBe(1)
  })

  it('authorizeOrchestratorRequest valida Bearer com timing-safe', () => {
    const prevCron = process.env.CRON_SECRET
    process.env.CRON_SECRET = 'test-secret-orch'
    try {
      const ok = new Headers({ authorization: 'Bearer test-secret-orch' })
      const bad = new Headers({ authorization: 'Bearer wrong' })
      expect(authorizeOrchestratorRequest(ok)).toBe(true)
      expect(authorizeOrchestratorRequest(bad)).toBe(false)
    } finally {
      if (prevCron === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = prevCron
    }
  })

  it('emite observabilidade com versões e cobertura Fact/KPI', async () => {
    const snapshots = createInMemoryDecisionSnapshotRepository()
    const result = await runDecisionIntelligenceOrchestrator({
      trigger: 'manual',
      storeIds: ['loja-obs-1'],
      snapshots,
      providersFactory: (id) => saleProviders(id),
      logMetrics: false,
      now: () => new Date('2026-07-19T22:00:00.000Z'),
    })
    const obs = result.metrics.storeResults[0]?.observability
    expect(obs).toBeTruthy()
    expect(obs!.coreVersion).toBe('di-core-v1.0')
    expect(obs!.schemaVersion).toBe(1)
    expect(obs!.ruleVersion).toBeTruthy()
    expect(obs!.engineLoopMs).toBeGreaterThanOrEqual(0)
    expect(obs!.factsUsed).toBeGreaterThan(0)
    expect(obs!.kpisSupported).toBeGreaterThanOrEqual(1)
    expect(result.metrics.totals.kpisSupported).toBeGreaterThanOrEqual(1)
  })

  it('computeSnapshotContentFingerprint é determinístico', async () => {
    const snapshots = createInMemoryDecisionSnapshotRepository()
    const cycle = await runStoreCycle({
      storeId: 'loja-orch-fp',
      providers: saleProviders('loja-orch-fp'),
      snapshots,
      now: () => new Date('2026-07-19T22:00:00.000Z'),
    })
    const latest = await snapshots.findLatestByLoja('loja-orch-fp')
    expect(latest).toBeTruthy()
    expect(computeSnapshotContentFingerprint(latest!.payload)).toBe(
      cycle.contentFingerprint,
    )
  })
})
