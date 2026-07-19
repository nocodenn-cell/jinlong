/**
 * Decision Intelligence — barrel público (ADR-011).
 * Cycles 0–8 v1.0: pipeline completo + hardening de rastreio/imutabilidade.
 */

export type { IntelligenceErrorCode } from './errorCodes'
export { INTELLIGENCE_ERROR_CODES } from './errorCodes'

export type {
  ConfidenceLevel,
  EntityRef,
  Evidence,
  EvidenceKind,
  IntelligenceSlice,
  MoneyAmount,
  OperationalConfidence,
  OperationalDomain,
  OperationalEventRef,
  TimeWindow,
  UrgencyTier,
} from './types'

export type {
  ActionPlan,
  ActionPlanItem,
  ActionPlanItemStatus,
  Alert,
  AlertImpact,
  AlertScope,
  AlertSeverity,
  AlertStatus,
  AlertSuggestedAction,
  AlertUrgency,
  DecisionAlert,
  DecisionAlertCore,
  AnalysisDomain,
  AnalysisEngineInput,
  AnalysisEvidence,
  AnalysisFinding,
  AnalysisInput,
  AnalysisResult,
  AnalysisSeverity,
  AnalysisSnapshot,
  AnalysisThresholds,
  BlockedFactRecord,
  DecisionExecution,
  DecisionKind,
  DecisionRecord,
  DecisionSnapshot,
  DerivedKpi,
  DerivedKpiStatus,
  Effectiveness,
  EngineCycleMetrics,
  ExecutiveSnapshot,
  ExecutionStatus,
  FactConfidenceSummary,
  MemoryEntry,
  MemorySnapshot,
  FactEnvelope,
  FactProviderDescriptor,
  FactProviderSupportLevel,
  FactRegistryEntry,
  FinancialImpactEstimate,
  KpiDefinition,
  KpiDerivationDefinition,
  KpiId,
  KpiInput,
  KpiUsageRef,
  KpiValue,
  OutcomeSlot,
  OutcomeSnapshot,
  Recommendation,
  RecommendationCategory,
  RecommendationEligibility,
  RecommendationEngineInput,
  RecommendationEnginePort,
  RecommendationJustification,
  RecommendationStatus,
  RecommendedAction,
} from './contracts'
export {
  DEFAULT_ANALYSIS_THRESHOLDS,
  defaultOperationalConfidence,
  evaluateProviderForRecommendation,
  summarizeFactConfidence,
} from './contracts'

export type {
  FactId,
  FactOwnerDomain,
  FactReadiness,
  WaveASupportedFactId,
  WaveBConditionalFactId,
} from './facts'
export {
  FACT_IDS,
  FACT_REGISTRY,
  WAVE_A_DESCRIPTORS,
  WAVE_A_SUPPORTED_FACT_IDS,
  WAVE_B_CONDITIONAL_FACT_IDS,
  WAVE_B_DESCRIPTORS,
  WAVE_CONTEXT_FACT_IDS,
  assertWaveAOnly,
  getFactEntry,
  isWaveASupportedFactId,
  listFactEntries,
} from './facts'

export type {
  DiDataGate,
  DiGateId,
  DiGateKind,
  DiGateStatus,
  FactConsumptionVerdict,
} from './gates'
export {
  DI_DATA_GATES,
  DI_GATE_IDS,
  evaluateFactConsumption,
  gatesAffectingFact,
  isFactProviderIoAllowed,
  listOpenGates,
} from './gates'

export type { FactProviderPort, FactQuery } from './ports'

export type {
  AggregateFactsResult,
  EngineLoopOptions,
  KpiDerivationInput,
  KpiDerivationResult,
  ProviderLoadBatch,
} from './engines'
export {
  aggregateFacts,
  assertRecommendationInputPurity,
  createRecommendationEngineStub,
  deriveKpiInputStub,
  deriveKpis,
  runAnalysisEngine,
  runAnalysisStub,
  runEngineLoop,
} from './engines'

export { createInMemoryFactProvider, envelopeStub } from './providers'

export type { CatalogKpiId } from './kpi'
export {
  KPI_IDS,
  KPI_REGISTRY,
  getKpiDefinition,
  listKpiDefinitions,
  propagateOperationalConfidence,
} from './kpi'

export type { AnalysisRule, AnalysisRuleContext } from './analysis'
export { ANALYSIS_RULES, listAnalysisRuleIds } from './analysis'

export type {
  RecommendationEngineSyncInput,
  RecommendationRule,
  RecommendationRuleContext,
  RecommendationSnapshot,
} from './recommendation'
export {
  assertRecommendationDeterminism,
  createRecommendationEngine,
  listRecommendationRuleIds,
  RECOMMENDATION_RULES,
  runRecommendationEngine,
} from './recommendation'

export {
  FORBIDDEN_ACTION_PLAN_CODES,
  FORBIDDEN_OPERATIONAL_ACTION_CODES,
  isForbiddenActionPlanCode,
  isForbiddenOperationalAction,
  isOrganizingActionCode,
  MIN_RECOMMENDATION_OPERATIONAL_CONFIDENCE,
} from './policy'
export type { ForbiddenOperationalActionCode } from './policy'

export type {
  AlertEngineInput,
  AlertRule,
  AlertRuleContext,
  AlertSnapshot,
  SeverityPlan,
} from './alerts'
export {
  ALERT_RULES,
  assertAlertDeterminism,
  buildAlertFromRecommendation,
  computeAlertUrgency,
  listAlertDetectorIds,
  planSeverityFromRecommendation,
  runAlertEngine,
} from './alerts'

export type {
  ActionPlanEngineInput,
  ActionPlanRule,
  ActionPlanSnapshot,
} from './action-plan'
export {
  ACTION_PLAN_RULES,
  assertActionPlanDeterminism,
  listActionPlanRuleIds,
  objectiveForRecommendationCode,
  runActionPlanEngine,
} from './action-plan'

export type { MemoryEngineInput } from './memory'
export {
  assertMemoryDeterminism,
  runMemoryEngine,
} from './memory'

export type { ExecutiveEngineInput } from './executive'
export {
  assertExecutiveDeterminism,
  runExecutiveEngine,
} from './executive'

export { cloneFactEnvelope, deepFreeze } from './immutability'