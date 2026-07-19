export type { AggregateFactsResult, ProviderLoadBatch } from './fact-aggregator'
export { aggregateFacts } from './fact-aggregator'

export type { EngineLoopOptions } from './engine-loop'
export { runEngineLoop } from './engine-loop'

export type { KpiDerivationInput, KpiDerivationResult } from './kpi-derivation-engine'
export { deriveKpis } from './kpi-derivation-engine'

/** @deprecated Cycle 1 stub — use deriveKpis */
export { deriveKpiInputStub } from './kpi-deriver-stub'

/** @deprecated use runAnalysisEngine */
export { runAnalysisStub } from './analysis-stub'
export { runAnalysisEngine } from '../analysis/analysis-engine'
export {
  assertRecommendationInputPurity,
  createRecommendationEngineStub,
} from './recommendation-engine-stub'
export {
  createRecommendationEngine,
  runRecommendationEngine,
} from '../recommendation/recommendation-engine'
export { runAlertEngine } from '../alerts/alert-engine'
export { runActionPlanEngine } from '../action-plan/action-plan-engine'
export { runMemoryEngine } from '../memory/memory-engine'
export { runExecutiveEngine } from '../executive/executive-engine'
