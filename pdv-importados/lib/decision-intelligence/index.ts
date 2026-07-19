export {
  DI_CORE_SNAPSHOT_VERSION,
  DI_SNAPSHOT_SCHEMA_VERSION,
} from './constants'
export type {
  DecisionSnapshotPersistMeta,
  DecisionSnapshotRecord,
  DecisionSnapshotRepositoryPort,
  DecisionSnapshotSaveResult,
} from './ports/decision-snapshot-repository'
export {
  decodeDecisionSnapshotPayload,
  encodeDecisionSnapshotPayload,
  extractPipelineFingerprint,
} from './snapshot-codec'
export type { DecisionSnapshotPayloadEnvelope } from './snapshot-codec'
export { createInMemoryDecisionSnapshotRepository } from './adapters/in-memory-decision-snapshot-repository'
export { createSupabaseDecisionSnapshotRepository } from './adapters/supabase-decision-snapshot-repository'
export {
  persistDecisionSnapshot,
  persistDecisionSnapshotAsync,
} from './persist-decision-snapshot'
export type { PersistDecisionSnapshotOptions } from './persist-decision-snapshot'

export {
  EMPTY_TIMED_OUTCOMES,
  type DecisionReasonCode,
  type DecisionRecord,
  type DecisionRecordCreateInput,
  type DecisionRecordOutcomePatch,
  type DecisionRecordStatus,
  type DecisionTimedOutcomes,
  type MeasurableOutcome,
  type TimedOutcomeSlot,
} from './models/decision-record'
export type {
  DecisionRecordRepositoryPort,
  DecisionRecordSaveResult,
} from './ports/decision-record-repository'
export { createInMemoryDecisionRecordRepository } from './adapters/in-memory-decision-record-repository'
export { createSupabaseDecisionRecordRepository } from './adapters/supabase-decision-record-repository'

export {
  buildDecisionIntelligenceReadModel,
  type BuildReadModelInput,
  type CriticalAlertsProjection,
  type DailyActionPlanProjection,
  type DecisionHistoryProjection,
  type DecisionIntelligenceReadModel,
  type DecisionPerformanceProjection,
  type ExecutiveDashboardProjection,
  type PendingReviewsProjection,
  type RecommendationQueueProjection,
} from './read-model'
export type { DecisionReadModelPort } from './ports/decision-read-model'
export { createDecisionReadModelAdapter } from './adapters/decision-read-model-adapter'

export {
  authorizeOrchestratorRequest,
  computeSnapshotContentFingerprint,
  createEmptyWaveAProviders,
  listActiveStoreIds,
  logOrchestratorMetrics,
  resolveOrchestratorSecret,
  runDecisionIntelligenceOrchestrator,
  runStoreCycle,
  type FactProvidersFactory,
  type ListStoreIdsFn,
  type OrchestratorRunMetrics,
  type OrchestratorRunResult,
  type OrchestratorStage,
  type OrchestratorTrigger,
  type RunOrchestratorOptions,
  type RunStoreCycleDeps,
  type StoreCycleOutcome,
  type StoreCycleResult,
} from './orchestrator'

export {
  createWaveAProviders,
  mapSaleRow,
  mapArTitleRow,
  mapApTitleRow,
  mapStockPositionRow,
  mapProductRow,
} from './providers'
