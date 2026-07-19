/**
 * Decision Intelligence — barrel público (ADR-011).
 * Cycle 4: Recommendation Engine (Findings → opções de revisão). Sem Alert/UI.
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
  ExecutionStatus,
  FactConfidenceSummary,
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
  FORBIDDEN_OPERATIONAL_ACTION_CODES,
  isForbiddenOperationalAction,
  MIN_RECOMMENDATION_OPERATIONAL_CONFIDENCE,
} from './policy'
export type { ForbiddenOperationalActionCode } from './policy'