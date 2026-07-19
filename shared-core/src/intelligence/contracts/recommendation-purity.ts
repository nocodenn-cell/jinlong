import type { OperationalConfidence } from '../types/common'
import type { AnalysisFinding } from './analysis'
import type { DerivedKpi } from './derived-kpi'
import type { FactEnvelope } from './fact'
import type { Recommendation } from './recommendation'
import type { KpiValue } from './kpi'

/**
 * Pureza do Recommendation Engine.
 *
 * PROIBIDO: banco / Supabase / adapters / React / Next.
 * PERMITIDO: Facts + DerivedKPIs + Analysis Findings (já materializados).
 *
 * Facts → KPIs → Analysis → Recommendation → Action Plan
 */

export type RecommendationEngineInput = {
  facts: readonly FactEnvelope[]
  derivedKpis?: readonly DerivedKpi[]
  kpiValues?: readonly KpiValue[]
  /** Findings da Analysis — origem obrigatória das recommendations. */
  findings: readonly AnalysisFinding[]
  storeId: string
  requestedAt: string
}

export type RecommendationEnginePort = {
  /** Sem I/O — só o input tipado. */
  evaluate(input: RecommendationEngineInput): Promise<readonly Recommendation[]>
}

export type FactConfidenceSummary = {
  totalFacts: number
  supportedCount: number
  partialCount: number
  unsupportedCount: number
  /** Média de operationalConfidence dos Facts elegíveis (SUPPORTED+PARTIAL). */
  averageOperationalConfidence: OperationalConfidence
  /** 0–100 para mensagens de UI (ex.: "94% de confiança"). */
  averageOperationalConfidencePercent: number
  messageCode: string
}

/**
 * Agrega confiança para mensagens transparentes (Cycle 4+).
 * Usa operationalConfidence dos envelopes — não consulta infra.
 */
export function summarizeFactConfidence(
  facts: readonly FactEnvelope[],
): FactConfidenceSummary {
  let supportedCount = 0
  let partialCount = 0
  let unsupportedCount = 0
  let sum = 0
  let eligible = 0

  for (const f of facts) {
    if (f.confidence === 'UNSUPPORTED' || f.operationalConfidence <= 0) {
      unsupportedCount += 1
      continue
    }
    if (f.confidence === 'HIGH') {
      supportedCount += 1
    } else {
      partialCount += 1
    }
    sum += f.operationalConfidence
    eligible += 1
  }

  const average =
    eligible === 0 ? 0 : Math.round((sum / eligible) * 1000) / 1000
  const percent = Math.round(average * 100)

  return {
    totalFacts: facts.length,
    supportedCount,
    partialCount,
    unsupportedCount,
    averageOperationalConfidence: average,
    averageOperationalConfidencePercent: percent,
    messageCode:
      eligible === 0
        ? 'intel.rec.summary_no_eligible_facts'
        : 'intel.rec.summary_confidence',
  }
}
