import type { DecisionRecord } from './models/decision-record'
import type { GovernedMemoryRepositoryPort } from './ports/governed-memory-repository'
import type { GovernedMemorySaveResult } from './ports/governed-memory-repository'

/**
 * Ponte DecisionRecord → Memory governada.
 * Não altera regras do Core. Não usa IA. Append-only.
 */
export async function recordGovernedMemoryFromDecision(
  memory: GovernedMemoryRepositoryPort,
  record: DecisionRecord,
  eventKind:
    | 'DECISION_RECORDED'
    | 'OUTCOME_RECORDED'
    | 'TIMED_OUTCOME_RECORDED' = 'DECISION_RECORDED',
): Promise<GovernedMemorySaveResult> {
  const noteCodes = [
    `intel.governed.decision.${record.status}`,
    `intel.governed.reason.${record.decisionReason.toLowerCase()}`,
    `intel.governed.event.${eventKind.toLowerCase()}`,
  ]

  return memory.append({
    lojaId: record.lojaId,
    decisionId: record.id,
    recommendationId: record.recommendationId,
    eventKind,
    decisionStatus: record.status,
    decisionReason: record.decisionReason,
    noteCodes,
    metricCode:
      record.actualOutcome?.metricCode ??
      record.expectedOutcome?.metricCode ??
      null,
    expectedValue: record.expectedOutcome?.value ?? null,
    actualValue: record.actualOutcome?.value ?? null,
    recordedAt: new Date().toISOString(),
    actorId: record.actorId,
  })
}
