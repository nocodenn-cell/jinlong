import type { DecisionSnapshot, EngineCycleMetrics } from '../contracts/decision-snapshot'
import type { FactProviderPort, FactQuery } from '../ports/fact-provider'
import type { RecommendationEnginePort } from '../contracts/recommendation-purity'
import { runActionPlanEngine } from '../action-plan/action-plan-engine'
import { runAlertEngine } from '../alerts/alert-engine'
import { runAnalysisEngine } from '../analysis/analysis-engine'
import { runExecutiveEngine } from '../executive/executive-engine'
import { runMemoryEngine } from '../memory/memory-engine'
import { createRecommendationEngine } from '../recommendation/recommendation-engine'
import {
  aggregateFacts,
  type ProviderLoadBatch,
} from './fact-aggregator'
import { deriveKpis } from './kpi-derivation-engine'
import { deepFreeze } from '../immutability'
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
  actionPlanCount: number,
  memoryEntryCount: number,
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
    actionPlans: actionPlanCount,
    memoryEntries: memoryEntryCount,
    executionTimeMs,
  }
}

/**
 * Engine Loop — pipeline puro completo (Cycles 1–8).
 * Facts → KPIs → Analysis → Recommendation → Alert → ActionPlan → Memory → Executive
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

  const alerts = runAlertEngine({
    storeId: options.storeId,
    requestedAt,
    recommendations,
  }).alerts

  const actionPlans = runActionPlanEngine({
    storeId: options.storeId,
    requestedAt,
    alerts,
    recommendations,
    findings: analysis.findings,
  }).actionPlans

  const memory = runMemoryEngine({
    storeId: options.storeId,
    requestedAt,
    findings: analysis.findings,
    recommendations,
    alerts,
    actionPlans,
    confidenceSummary: aggregate.confidenceSummary,
  })

  const executive = runExecutiveEngine({
    storeId: options.storeId,
    requestedAt,
    supportedKpis: kpi.supportedKpis,
    partialKpis: kpi.partialKpis,
    blockedKpis: kpi.blockedKpis,
    findings: analysis.findings,
    recommendations,
    alerts,
    actionPlans,
    memory,
  })

  const snapshot: DecisionSnapshot = {
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
    alerts,
    actionPlans,
    memory,
    executive,
    metrics: buildMetrics(
      aggregate,
      kpi,
      analysis,
      actionPlans.length,
      memory.entries.length,
      Date.now() - started,
    ),
  }
  return deepFreeze(snapshot)
}
