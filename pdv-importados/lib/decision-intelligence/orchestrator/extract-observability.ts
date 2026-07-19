import type { DecisionSnapshot } from '@shared-core/src/intelligence'
import {
  DI_CORE_SNAPSHOT_VERSION,
  DI_SNAPSHOT_SCHEMA_VERSION,
} from '../constants'
import type { CycleObservability } from './types'

/**
 * Extrai métricas já produzidas pelo Core + timings da borda.
 * Não recalcula KPIs/Findings.
 */
export function extractCycleObservability(args: {
  snapshot: DecisionSnapshot
  traceId?: string | null
  engineLoopMs: number
  persistMs?: number | null
  snapshotVersion?: string | null
}): CycleObservability {
  const { snapshot, metrics } = {
    snapshot: args.snapshot,
    metrics: args.snapshot.metrics,
  }
  const blockedKpiIds = [
    ...snapshot.blockedKpis.map((k) => k.id),
    ...snapshot.derivedKpis
      .filter((k) => k.status === 'BLOCKED' || k.status === 'UNAVAILABLE')
      .map((k) => k.id),
  ]
  const uniqueBlocked = [...new Set(blockedKpiIds)]

  return {
    traceId: args.traceId ?? null,
    engineLoopMs: args.engineLoopMs,
    persistMs: args.persistMs ?? null,
    factsLoaded: metrics.factsLoaded,
    factsUsed: metrics.factsUsed,
    factsBlocked: metrics.factsBlocked,
    kpisSupported: metrics.kpisSupported,
    kpisPartial: metrics.kpisPartial,
    kpisBlocked: metrics.kpisBlocked,
    blockedKpiIds: uniqueBlocked,
    analysisFindings: metrics.analysisFindings,
    recommendations: snapshot.recommendations.length,
    alerts: snapshot.alerts.length,
    actionPlans: metrics.actionPlans,
    memoryEntries: metrics.memoryEntries,
    coreVersion: DI_CORE_SNAPSHOT_VERSION,
    schemaVersion: DI_SNAPSHOT_SCHEMA_VERSION,
    ruleVersion: snapshot.memory.ruleVersion,
    snapshotVersion: args.snapshotVersion ?? DI_CORE_SNAPSHOT_VERSION,
  }
}
