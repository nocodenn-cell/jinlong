import type { DecisionSnapshot, EngineCycleMetrics } from '../contracts/decision-snapshot'
import type { FactProviderPort, FactQuery } from '../ports/fact-provider'
import type { RecommendationEnginePort } from '../contracts/recommendation-purity'
import { runAnalysisEngine } from '../analysis/analysis-engine'
import {
  aggregateFacts,
  type ProviderLoadBatch,
} from './fact-aggregator'
import { deriveKpis } from './kpi-derivation-engine'
import { createRecommendationEngine } from '../recommendation/recommendation-engine'
import { assertRecommendationInputPurity } from './recommendation-engine-stub'

export type EngineLoopOptions = {
  storeId: string
  providers: readonly FactProviderPort[]
  query?: Omit<FactQuery, 'storeId'>
  waveAOnly?: boolean
  recommendationEngine?: RecommendationEnginePort
  now?: () => Date
}

function shouldIgnoreProvider(
  provider: FactProviderPort,
): { ignored: boolean; reason?: string } {
  const { wave } = provider.descriptor
  if (wave === 'CONTEXT') return { ignored: true, reason: 'context' }
  if (wave === 'DEFERRED') return { ignored: true, reason: 'deferred' }
  return { ignored: false }
}

async function loadProviderBatches(
  providers: readonly FactProviderPort[],
  query: FactQuery,
): Promise<ProviderLoadBatch[]> {
  const batches: ProviderLoadBatch[] = []
  for (const provider of providers) {
    const ignore = shouldIgnoreProvider(provider)
    if (ignore.ignored) {
      batches.push({
        descriptor: provider.descriptor,
        facts: [],
        ignored: true,
        ignoreReason: ignore.reason,
      })
      continue
    }
    const facts = await provider.load(query)
    batches.push({
      descriptor: provider.descriptor,
      facts,
      ignored: false,
    })
  }
  return batches
}

function buildMetrics(
  aggregate: ReturnType<typeof aggregateFacts>,
  kpi: ReturnType<typeof deriveKpis>,
  analysis: ReturnType<typeof runAnalysisEngine>,
  executionTimeMs: number,
): EngineCycleMetrics {
  const { confidenceSummary } = aggregate
  return {
    providersLoaded: aggregate.providersLoaded,
    providersIgnored: aggregate.providersIgnored,
    factsLoaded: aggregate.factsUsed.length + aggregate.factsPartialIdentified.length,
    factsBlocked: aggregate.factsBlocked.length,
    factsUsed: aggregate.factsUsed.length,
    factsPartialIdentified: aggregate.factsPartialIdentified.length,
    averageOperationalConfidence: confidenceSummary.averageOperationalConfidence,
    averageOperationalConfidencePercent:
      confidenceSummary.averageOperationalConfidencePercent,
    kpisSupported: kpi.supportedKpis.length,
    kpisPartial: kpi.partialKpis.length,
    kpisBlocked: kpi.blockedKpis.length,
    analysisFindings: analysis.findings.length,
    analysisSkippedInsufficient: analysis.skippedInsufficientData,
    executionTimeMs,
  }
}

/**
 * Engine Loop — pipeline puro.
 * Providers → Aggregate → KPIs → Analysis → Recommendation → Snapshot.
 */
export async function runEngineLoop(options: EngineLoopOptions): Promise<DecisionSnapshot> {
  const started = Date.now()
  const now = options.now ?? (() => new Date())
  const requestedAt = now().toISOString()
  const waveAOnly = options.waveAOnly ?? true
  const query: FactQuery = {
    storeId: options.storeId,
    ...options.query,
  }

  const batches = await loadProviderBatches(options.providers, query)
  const aggregate = aggregateFacts(batches, { waveAOnly })

  const kpi = deriveKpis({
    storeId: options.storeId,
    factsUsed: aggregate.factsUsed,
    factsPartialIdentified: aggregate.factsPartialIdentified,
    factsBlocked: aggregate.factsBlocked,
    requestedAt,
  })

  const analysis = runAnalysisEngine({
    storeId: options.storeId,
    requestedAt,
    derivedKpis: kpi.derivedKpis,
  })

  const recInput = {
    facts: aggregate.factsUsed,
    derivedKpis: kpi.derivedKpis,
    kpiValues: kpi.kpiValues,
    findings: analysis.findings,
    storeId: options.storeId,
    requestedAt,
  }
  assertRecommendationInputPurity(recInput)

  const recommendationEngine =
    options.recommendationEngine ?? createRecommendationEngine()
  const recommendations = await recommendationEngine.evaluate(recInput)

  return {
    timestamp: requestedAt,
    storeId: options.storeId,
    factsUsed: aggregate.factsUsed,
    factsPartialIdentified: aggregate.factsPartialIdentified,
    factsBlocked: aggregate.factsBlocked,
    derivedKpis: kpi.derivedKpis,
    supportedKpis: kpi.supportedKpis,
    partialKpis: kpi.partialKpis,
    blockedKpis: kpi.blockedKpis,
    kpiValues: kpi.kpiValues,
    analysis,
    confidenceSummary: aggregate.confidenceSummary,
    gatesEncountered: aggregate.gatesEncountered,
    recommendations,
    alerts: [],
    metrics: buildMetrics(aggregate, kpi, analysis, Date.now() - started),
  }
}
