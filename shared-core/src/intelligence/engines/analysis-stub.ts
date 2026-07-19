import { runAnalysisEngine } from '../analysis/analysis-engine'
import type { AnalysisInput, AnalysisResult } from '../contracts/pipeline-inputs'

/**
 * @deprecated Use `runAnalysisEngine` com `derivedKpis`.
 */
export function runAnalysisStub(input: AnalysisInput): AnalysisResult {
  return runAnalysisEngine({
    storeId: input.storeId,
    requestedAt: input.requestedAt,
    derivedKpis: [],
  })
}
