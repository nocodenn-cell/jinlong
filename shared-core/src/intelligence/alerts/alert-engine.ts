import type { Alert } from '../contracts/alert'
import { assertAlertDeterminism } from './determinism'
import { ALERT_RULES } from './registry'
import type {
  AlertEngineInput,
  AlertRuleContext,
  AlertSnapshot,
} from './types'

const DEFAULT_CONTEXT_WINDOW_DAYS = 30

/**
 * Alert Engine — puro.
 * Recommendations → Alerts priorizados. Sem I/O. Sem Action. Sem mutar Rec.
 */
export function runAlertEngine(input: AlertEngineInput): AlertSnapshot {
  const contextWindowDays =
    input.contextWindowDays ?? DEFAULT_CONTEXT_WINDOW_DAYS
  const alerts: Alert[] = []
  let skipped = 0

  for (const recommendation of input.recommendations) {
    for (const rule of ALERT_RULES) {
      if (!rule.recommendationCodes.includes(recommendation.recommendationCode)) {
        continue
      }

      const ctx: AlertRuleContext = {
        storeId: input.storeId,
        requestedAt: input.requestedAt,
        recommendation,
        contextWindowDays,
      }
      const result = rule.evaluate(ctx)
      if (result === 'SKIP') {
        skipped += 1
        continue
      }
      if (result === null) continue

      assertAlertDeterminism(result, input.recommendations)
      alerts.push(result)
    }
  }

  return {
    storeId: input.storeId,
    emittedAt: input.requestedAt,
    alerts,
    recommendationsConsidered: input.recommendations.length,
    skipped,
  }
}
