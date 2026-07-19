import type { DecisionIntelligenceReadModel } from '../read-model/models'

export type OrchestratorTrigger = 'manual' | 'scheduled'

export type OrchestratorStage =
  | 'list_stores'
  | 'providers'
  | 'engine_loop'
  | 'idempotency'
  | 'persist'
  | 'read_model'

export type StoreCycleOutcome =
  | 'created'
  | 'reused'
  | 'failed'

export type StoreCycleResult = {
  storeId: string
  outcome: StoreCycleOutcome
  stage: OrchestratorStage | null
  snapshotId: string | null
  contentFingerprint: string | null
  ruleVersion: string | null
  snapshotVersion: string | null
  durationMs: number
  errorCode: string | null
  errorMessage: string | null
  /** Projeção opcional pós-ciclo (não materializada — só retorno). */
  readModel: DecisionIntelligenceReadModel | null
}

export type OrchestratorRunMetrics = {
  runId: string
  trigger: OrchestratorTrigger
  startedAt: string
  finishedAt: string
  durationMs: number
  coreVersion: string
  schemaVersion: number
  /** ruleVersion observada nos snapshots processados (ex.: memory.ruleVersion). */
  ruleVersion: string | null
  storesAttempted: number
  snapshotsCreated: number
  snapshotsReused: number
  failuresTotal: number
  failuresByStage: Readonly<Record<OrchestratorStage, number>>
  storeResults: readonly StoreCycleResult[]
}

export type OrchestratorRunResult = {
  ok: boolean
  metrics: OrchestratorRunMetrics
}
