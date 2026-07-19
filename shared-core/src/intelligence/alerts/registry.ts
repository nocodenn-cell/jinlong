import { attentionFromRecommendationRule } from './rules/attention-rules'
import type { AlertRule } from './types'

export const ALERT_RULES: readonly AlertRule[] = [
  attentionFromRecommendationRule,
]

export function listAlertDetectorIds(): string[] {
  return ALERT_RULES.map((r) => r.detectorId)
}
