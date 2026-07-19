import type { AnalysisFinding } from '../contracts/analysis'
import type { DerivedKpi } from '../contracts/derived-kpi'
import type { Recommendation } from '../contracts/recommendation'
import type { AnalysisSeverity } from '../contracts/analysis'

/**
 * Tipos internos do Recommendation Engine (Cycle 4).
 * Sugere opções de revisão — não decisões operacionais.
 */

export type RecommendationRuleContext = {
  storeId: string
  requestedAt: string
  finding: AnalysisFinding
  derivedKpis: readonly DerivedKpi[]
}

export type RecommendationRule = {
  ruleId: string
  ruleVersion: string
  /** Finding titleCodes / ids que esta regra consome. */
  basedOnFindingIds: readonly string[]
  /** Severidades mínimas (INFO tipicamente não gera recommendation). */
  minSeverity: AnalysisSeverity
  evaluate(ctx: RecommendationRuleContext): Recommendation | 'SKIP_POLICY' | null
}

export type RecommendationEngineSyncInput = {
  storeId: string
  requestedAt: string
  findings: readonly AnalysisFinding[]
  derivedKpis: readonly DerivedKpi[]
}

export type RecommendationSnapshot = {
  storeId: string
  emittedAt: string
  recommendations: readonly Recommendation[]
  findingsConsidered: number
  skippedByPolicy: number
}
