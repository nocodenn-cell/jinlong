import type { Alert, AlertSeverity } from '../contracts/alert'
import type { Recommendation } from '../contracts/recommendation'

/**
 * Tipos internos do Alert Engine (Cycle 5).
 * Recommendation → Alert. Sem Action. Sem mutar Recommendation.
 */

export type AlertRuleContext = {
  storeId: string
  requestedAt: string
  recommendation: Recommendation
  /** Janela de contexto em dias (default 30). */
  contextWindowDays: number
}

export type AlertRule = {
  detectorId: string
  detectorVersion: string
  recommendationCodes: readonly string[]
  evaluate(ctx: AlertRuleContext): Alert | 'SKIP' | null
}

export type AlertEngineInput = {
  storeId: string
  requestedAt: string
  recommendations: readonly Recommendation[]
  contextWindowDays?: number
}

export type AlertSnapshot = {
  storeId: string
  emittedAt: string
  alerts: readonly Alert[]
  recommendationsConsidered: number
  skipped: number
}

export type SeverityPlan = {
  severity: AlertSeverity
  justificationCode: string
}
