import type { Alert } from '../contracts/alert'
import type { Recommendation } from '../contracts/recommendation'

/**
 * Alert Determinism Gate (Cycle 5).
 * Sem Recommendation / evidence / confidence / severity justification → não entra.
 */
export function assertAlertDeterminism(
  alert: Alert,
  sourceRecommendations: readonly Recommendation[],
): void {
  if (alert.sourceRecommendationIds.length === 0) {
    throw new Error(`INTEL_ALERT_NO_RECOMMENDATION:${alert.id}`)
  }
  if (alert.sourceFindingIds.length === 0) {
    throw new Error(`INTEL_ALERT_NO_FINDING:${alert.id}`)
  }
  if (alert.evidences.length === 0) {
    throw new Error(`INTEL_ALERT_NO_EVIDENCE:${alert.id}`)
  }
  if (!alert.severityJustificationCode) {
    throw new Error(`INTEL_ALERT_NO_SEVERITY_JUSTIFICATION:${alert.id}`)
  }
  if (!alert.urgency.reason || typeof alert.urgency.score !== 'number') {
    throw new Error(`INTEL_ALERT_BAD_URGENCY:${alert.id}`)
  }
  if (
    typeof alert.operationalConfidence !== 'number' ||
    alert.operationalConfidence < 0 ||
    alert.operationalConfidence > 1
  ) {
    throw new Error(`INTEL_ALERT_BAD_CONFIDENCE:${alert.id}`)
  }
  if (!alert.detectorId || !alert.detectorVersion) {
    throw new Error(`INTEL_ALERT_NO_DETECTOR:${alert.id}`)
  }
  if (!alert.titleCode) {
    throw new Error(`INTEL_ALERT_NO_TITLE:${alert.id}`)
  }

  const sources = sourceRecommendations.filter((r) =>
    alert.sourceRecommendationIds.includes(r.id),
  )
  if (sources.length === 0) {
    throw new Error(`INTEL_ALERT_ORPHAN_RECOMMENDATION:${alert.id}`)
  }

  const maxAllowed = Math.min(...sources.map((r) => r.operationalConfidence))
  if (alert.operationalConfidence > maxAllowed) {
    throw new Error(
      `INTEL_ALERT_CONFIDENCE_INFLATED:${alert.id}:${alert.operationalConfidence}>${maxAllowed}`,
    )
  }
}
