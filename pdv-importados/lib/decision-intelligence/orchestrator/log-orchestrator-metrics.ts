import type { OrchestratorRunMetrics } from './types'

/**
 * Log estruturado — sem APM obrigatório.
 * Compatível com agregação futura (Sentry/logs).
 */
export function logOrchestratorMetrics(metrics: OrchestratorRunMetrics): void {
  const summary = {
    event: 'decision_intelligence.orchestrator.run',
    runId: metrics.runId,
    trigger: metrics.trigger,
    startedAt: metrics.startedAt,
    finishedAt: metrics.finishedAt,
    durationMs: metrics.durationMs,
    coreVersion: metrics.coreVersion,
    schemaVersion: metrics.schemaVersion,
    ruleVersion: metrics.ruleVersion,
    storesAttempted: metrics.storesAttempted,
    snapshotsCreated: metrics.snapshotsCreated,
    snapshotsReused: metrics.snapshotsReused,
    failuresTotal: metrics.failuresTotal,
    failuresByStage: metrics.failuresByStage,
  }
  if (metrics.failuresTotal > 0) {
    console.error(JSON.stringify(summary))
    return
  }
  console.info(JSON.stringify(summary))
}
