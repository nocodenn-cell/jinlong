import {
  runEngineLoop,
  type FactProviderPort,
} from '@shared-core/src/intelligence'
import {
  DI_CORE_SNAPSHOT_VERSION,
  DI_SNAPSHOT_SCHEMA_VERSION,
} from '../constants'
import { persistDecisionSnapshot } from '../persist-decision-snapshot'
import type { DecisionSnapshotRepositoryPort } from '../ports/decision-snapshot-repository'
import type { DecisionRecordRepositoryPort } from '../ports/decision-record-repository'
import { buildDecisionIntelligenceReadModel } from '../read-model/build-read-model'
import { computeSnapshotContentFingerprint } from './content-fingerprint'
import { extractCycleObservability } from './extract-observability'
import type { StoreCycleResult } from './types'

export type RunStoreCycleDeps = {
  storeId: string
  providers: readonly FactProviderPort[]
  snapshots: DecisionSnapshotRepositoryPort
  decisions?: DecisionRecordRepositoryPort
  persistRetries?: number
  now?: () => Date
  waveAOnly?: boolean
  traceId?: string
}

function emptyFailures(
  storeId: string,
  stage: StoreCycleResult['stage'],
  started: number,
  code: string,
  message: string,
): StoreCycleResult {
  return {
    storeId,
    outcome: 'failed',
    stage,
    snapshotId: null,
    contentFingerprint: null,
    ruleVersion: null,
    snapshotVersion: null,
    durationMs: Date.now() - started,
    errorCode: code,
    errorMessage: message,
    observability: null,
    readModel: null,
  }
}

async function persistWithRetry(
  deps: RunStoreCycleDeps,
  snapshot: Parameters<typeof persistDecisionSnapshot>[0]['snapshot'],
): Promise<{
  result: Awaited<ReturnType<typeof persistDecisionSnapshot>>
  persistMs: number
}> {
  const attempts = Math.max(1, (deps.persistRetries ?? 1) + 1)
  const t0 = Date.now()
  let last = await persistDecisionSnapshot({
    repository: deps.snapshots,
    snapshot,
    meta: {
      snapshotVersion: DI_CORE_SNAPSHOT_VERSION,
      schemaVersion: DI_SNAPSHOT_SCHEMA_VERSION,
      traceId: deps.traceId,
    },
  })
  for (let i = 1; i < attempts && !last.ok; i += 1) {
    last = await persistDecisionSnapshot({
      repository: deps.snapshots,
      snapshot,
      meta: {
        snapshotVersion: DI_CORE_SNAPSHOT_VERSION,
        schemaVersion: DI_SNAPSHOT_SCHEMA_VERSION,
        traceId: deps.traceId,
      },
    })
  }
  return { result: last, persistMs: Date.now() - t0 }
}

/**
 * Ciclo por loja: Engine Loop → idempotência → persist → projeção Read Model.
 * Coordenação apenas — sem recalcular regras do Core.
 */
export async function runStoreCycle(
  deps: RunStoreCycleDeps,
): Promise<StoreCycleResult> {
  const started = Date.now()
  const { storeId } = deps

  let snapshot
  const engineStarted = Date.now()
  try {
    snapshot = await runEngineLoop({
      storeId,
      providers: deps.providers,
      waveAOnly: deps.waveAOnly ?? true,
      now: deps.now,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return emptyFailures(storeId, 'engine_loop', started, 'DI_ORCH_ENGINE', message)
  }
  const engineLoopMs = Date.now() - engineStarted

  const contentFingerprint = computeSnapshotContentFingerprint(snapshot)
  const ruleVersion = snapshot.memory.ruleVersion

  let latest
  try {
    latest = await deps.snapshots.findLatestByLoja(storeId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return emptyFailures(
      storeId,
      'idempotency',
      started,
      'DI_ORCH_IDEMPOTENCY_READ',
      message,
    )
  }

  if (latest?.payload) {
    const prevFp = computeSnapshotContentFingerprint(latest.payload)
    if (prevFp === contentFingerprint) {
      let readModel = null
      if (deps.decisions) {
        const records = await deps.decisions.listByLoja(storeId)
        readModel = buildDecisionIntelligenceReadModel({
          snapshot: latest.payload,
          records,
          snapshotVersion: latest.snapshotVersion,
        })
      }
      return {
        storeId,
        outcome: 'reused',
        stage: 'idempotency',
        snapshotId: latest.id,
        contentFingerprint,
        ruleVersion,
        snapshotVersion: latest.snapshotVersion,
        durationMs: Date.now() - started,
        errorCode: null,
        errorMessage: null,
        observability: extractCycleObservability({
          snapshot: latest.payload,
          traceId: deps.traceId,
          engineLoopMs,
          persistMs: 0,
          snapshotVersion: latest.snapshotVersion,
        }),
        readModel,
      }
    }
  }

  const { result: persistResult, persistMs } = await persistWithRetry(
    deps,
    snapshot,
  )
  if (!persistResult.ok) {
    return {
      storeId,
      outcome: 'failed',
      stage: 'persist',
      snapshotId: null,
      contentFingerprint,
      ruleVersion,
      snapshotVersion: DI_CORE_SNAPSHOT_VERSION,
      durationMs: Date.now() - started,
      errorCode: persistResult.code,
      errorMessage: persistResult.message,
      observability: extractCycleObservability({
        snapshot,
        traceId: deps.traceId,
        engineLoopMs,
        persistMs,
      }),
      readModel: null,
    }
  }

  let readModel = null
  try {
    const records = deps.decisions
      ? await deps.decisions.listByLoja(storeId)
      : []
    readModel = buildDecisionIntelligenceReadModel({
      snapshot,
      records,
      snapshotVersion: DI_CORE_SNAPSHOT_VERSION,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      storeId,
      outcome: 'failed',
      stage: 'read_model',
      snapshotId: persistResult.id,
      contentFingerprint,
      ruleVersion,
      snapshotVersion: DI_CORE_SNAPSHOT_VERSION,
      durationMs: Date.now() - started,
      errorCode: 'DI_ORCH_READ_MODEL',
      errorMessage: message,
      observability: extractCycleObservability({
        snapshot,
        traceId: deps.traceId,
        engineLoopMs,
        persistMs,
      }),
      readModel: null,
    }
  }

  return {
    storeId,
    outcome: 'created',
    stage: 'persist',
    snapshotId: persistResult.id,
    contentFingerprint,
    ruleVersion,
    snapshotVersion: DI_CORE_SNAPSHOT_VERSION,
    durationMs: Date.now() - started,
    errorCode: null,
    errorMessage: null,
    observability: extractCycleObservability({
      snapshot,
      traceId: deps.traceId,
      engineLoopMs,
      persistMs,
    }),
    readModel,
  }
}
