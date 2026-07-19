import type { DerivedKpi } from '../contracts/derived-kpi'
import type { KpiId } from '../contracts/kpi'
import type {
  AnalysisDomain,
  AnalysisFinding,
  AnalysisThresholds,
} from '../contracts/analysis'

export type {
  AnalysisDomain,
  AnalysisEngineInput,
  AnalysisEvidence,
  AnalysisFinding,
  AnalysisSeverity,
  AnalysisSnapshot,
  AnalysisThresholds,
} from '../contracts/analysis'
export { DEFAULT_ANALYSIS_THRESHOLDS } from '../contracts/analysis'

export type AnalysisRuleContext = {
  storeId: string
  requestedAt: string
  byId: ReadonlyMap<KpiId, DerivedKpi>
  thresholds: AnalysisThresholds
}

export type AnalysisRule = {
  ruleId: string
  domain: AnalysisDomain
  evaluate(ctx: AnalysisRuleContext): AnalysisFinding | 'SKIP_INSUFFICIENT' | null
}
