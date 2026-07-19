import type { DerivedKpi } from '../contracts/derived-kpi'
import type { KpiId } from '../contracts/kpi'
import { ANALYSIS_RULES } from './analysis-registry'
import {
  DEFAULT_ANALYSIS_THRESHOLDS,
  type AnalysisEngineInput,
  type AnalysisFinding,
  type AnalysisRuleContext,
  type AnalysisSnapshot,
  type AnalysisThresholds,
} from './types'

function buildKpiIndex(
  kpis: readonly DerivedKpi[],
): Map<KpiId, DerivedKpi> {
  const map = new Map<KpiId, DerivedKpi>()
  for (const k of kpis) map.set(k.id, k)
  return map
}

function mergeThresholds(
  partial?: Partial<AnalysisThresholds>,
): AnalysisThresholds {
  return { ...DEFAULT_ANALYSIS_THRESHOLDS, ...partial }
}

function assertFindingHasEvidence(finding: AnalysisFinding): void {
  if (finding.evidence.length === 0) {
    throw new Error(`INTEL_ANALYSIS_NO_EVIDENCE:${finding.id}`)
  }
}

/**
 * Analysis Engine — puro.
 * DerivedKPIs → Findings. Não cria Recommendations. Sem I/O.
 */
export function runAnalysisEngine(input: AnalysisEngineInput): AnalysisSnapshot {
  const thresholds = mergeThresholds(input.thresholds)
  const byId = buildKpiIndex(input.derivedKpis)
  const ctx: AnalysisRuleContext = {
    storeId: input.storeId,
    requestedAt: input.requestedAt,
    byId,
    thresholds,
  }

  const findings: AnalysisFinding[] = []
  let skippedInsufficientData = 0

  for (const rule of ANALYSIS_RULES) {
    const result = rule.evaluate(ctx)
    if (result === 'SKIP_INSUFFICIENT') {
      skippedInsufficientData += 1
      continue
    }
    if (result === null) continue
    assertFindingHasEvidence(result)
    findings.push(result)
  }

  return {
    storeId: input.storeId,
    analyzedAt: input.requestedAt,
    findings,
    kpisConsidered: input.derivedKpis.length,
    skippedInsufficientData,
  }
}
