import type { FactProviderPort } from '@shared-core/src/intelligence'
import {
  DI_CORE_SNAPSHOT_VERSION,
  DI_SNAPSHOT_SCHEMA_VERSION,
} from '../constants'
import type { DecisionRecordRepositoryPort } from '../ports/decision-record-repository'
import type { DecisionSnapshotRepositoryPort } from '../ports/decision-snapshot-repository'
import { logOrchestratorMetrics } from './log-orchestrator-metrics'
import { runStoreCycle } from './run-store-cycle'
import type {
  OrchestratorRunMetrics,
  OrchestratorRunResult,
  OrchestratorStage,
  OrchestratorTrigger,
  StoreCycleResult,
} from './types'

export type FactProvidersFactory = (
  storeId: string,
) => readonly FactProviderPort[] | Promise<readonly FactProviderPort[]>

export type ListStoreIdsFn = () => Promise<readonly string[]>

export type RunOrchestratorOptions = {
  trigger: OrchestratorTrigger
  /** Se omitido, usa `listStoreIds`. */
  storeIds?: readonly string[]
  listStoreIds?: ListStoreIdsFn
  snapshots: DecisionSnapshotRepositoryPort
  decisions?: DecisionRecordRepositoryPort
  providersFactory: FactProvidersFactory
  persistRetries?: number
  now?: () => Date
  waveAOnly?: boolean
  /** Loga métricas estruturadas (default true). */
  logMetrics?: boolean
  runId?: string
}

function emptyStageCounts(): Record<OrchestratorStage, number> {
  return {
    list_stores: 0,
    providers: 0,
    engine_loop: 0,
    idempotency: 0,
    persist: 0,
    read_model: 0,
  }
}

function newRunId(now: Date): string {
  return `di-orch-${now.toISOString()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildMetrics(
  trigger: OrchestratorTrigger,
  runId: string,
  startedAt: string,
  finishedAt: string,
  durationMs: number,
  results: readonly StoreCycleResult[],
  listStoresFailed: boolean,
): OrchestratorRunMetrics {
  const failuresByStage = emptyStageCounts()
  let snapshotsCreated = 0
  let snapshotsReused = 0
  let failuresTotal = 0
  let ruleVersion: string | null = null

  for (const r of results) {
    if (r.ruleVersion) ruleVersion = r.ruleVersion
    if (r.outcome === 'reused') snapshotsReused += 1
    else if (r.outcome === 'created' || r.snapshotId) snapshotsCreated += 1

    if (r.outcome === 'failed') {
      failuresTotal += 1
      if (r.stage) failuresByStage[r.stage] += 1
    }
  }
  if (listStoresFailed) {
    failuresTotal += 1
    failuresByStage.list_stores += 1
  }

  return {
    runId,
    trigger,
    startedAt,
    finishedAt,
    durationMs,
    coreVersion: DI_CORE_SNAPSHOT_VERSION,
    schemaVersion: DI_SNAPSHOT_SCHEMA_VERSION,
    ruleVersion,
    storesAttempted: results.length,
    snapshotsCreated,
    snapshotsReused,
    failuresTotal,
    failuresByStage,
    storeResults: results,
  }
}

/**
 * DecisionIntelligenceOrchestrator — coordena o fluxo fora do Core.
 * Manual ou agendado; idempotente por content fingerprint; falhas isoladas por loja.
 */
export async function runDecisionIntelligenceOrchestrator(
  options: RunOrchestratorOptions,
): Promise<OrchestratorRunResult> {
  const nowFn = options.now ?? (() => new Date())
  const startedDate = nowFn()
  const startedAt = startedDate.toISOString()
  const runId = options.runId ?? newRunId(startedDate)
  const results: StoreCycleResult[] = []
  let listStoresFailed = false

  let storeIds: readonly string[] = options.storeIds ?? []
  if (!options.storeIds) {
    if (!options.listStoreIds) {
      listStoresFailed = true
      const finishedDate = nowFn()
      const metrics = buildMetrics(
        options.trigger,
        runId,
        startedAt,
        finishedDate.toISOString(),
        finishedDate.getTime() - startedDate.getTime(),
        results,
        listStoresFailed,
      )
      if (options.logMetrics !== false) logOrchestratorMetrics(metrics)
      return { ok: false, metrics }
    }
    try {
      storeIds = await options.listStoreIds()
    } catch {
      listStoresFailed = true
      const finishedDate = nowFn()
      const metrics = buildMetrics(
        options.trigger,
        runId,
        startedAt,
        finishedDate.toISOString(),
        finishedDate.getTime() - startedDate.getTime(),
        results,
        true,
      )
      if (options.logMetrics !== false) logOrchestratorMetrics(metrics)
      return { ok: false, metrics }
    }
  }

  for (const storeId of storeIds) {
    let providers: readonly FactProviderPort[]
    try {
      providers = await options.providersFactory(storeId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({
        storeId,
        outcome: 'failed',
        stage: 'providers',
        snapshotId: null,
        contentFingerprint: null,
        ruleVersion: null,
        snapshotVersion: null,
        durationMs: 0,
        errorCode: 'DI_ORCH_PROVIDERS',
        errorMessage: message,
        readModel: null,
      })
      continue
    }

    const cycle = await runStoreCycle({
      storeId,
      providers,
      snapshots: options.snapshots,
      decisions: options.decisions,
      persistRetries: options.persistRetries,
      now: options.now,
      waveAOnly: options.waveAOnly,
      traceId: runId,
    })
    results.push(cycle)
  }

  const finishedDate = nowFn()
  const metrics = buildMetrics(
    options.trigger,
    runId,
    startedAt,
    finishedDate.toISOString(),
    finishedDate.getTime() - startedDate.getTime(),
    results,
    listStoresFailed,
  )
  if (options.logMetrics !== false) logOrchestratorMetrics(metrics)
  return { ok: metrics.failuresTotal === 0, metrics }
}
