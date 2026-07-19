import type { FactId } from '../facts/definitions'
import type { ConfidenceLevel, OperationalConfidence } from '../types/common'
import type { FactEnvelope } from '../contracts/fact'
import type { FactProviderSupportLevel } from '../contracts/provider-support'
import type { DerivedKpiStatus } from '../contracts/derived-kpi'

/**
 * Estratégia Weakest Link — ver DECISION_INTELLIGENCE_CYCLE_2.md
 *
 * confidence_KPI = min(operationalConfidence dos Facts usados)
 */
export function propagateOperationalConfidence(
  facts: readonly FactEnvelope[],
): OperationalConfidence {
  if (facts.length === 0) return 0
  let min = 1
  for (const f of facts) {
    if (f.operationalConfidence < min) min = f.operationalConfidence
  }
  return Math.round(min * 1000) / 1000
}

export function operationalToConfidenceLevel(
  operational: OperationalConfidence,
  status: DerivedKpiStatus,
): ConfidenceLevel {
  if (status === 'BLOCKED' || status === 'UNAVAILABLE' || operational <= 0) {
    return 'UNSUPPORTED'
  }
  if (status === 'PARTIAL' || operational < 0.9) return 'MEDIUM'
  return 'HIGH'
}

export function inferSupportLevelFromFacts(
  facts: readonly FactEnvelope[],
  status: DerivedKpiStatus,
): FactProviderSupportLevel {
  if (status === 'BLOCKED') return 'UNSUPPORTED'
  if (status === 'UNAVAILABLE') return 'UNSUPPORTED'
  if (status === 'PARTIAL') return 'PARTIAL'
  if (facts.some((f) => f.readiness === 'PARTIAL' || f.confidence === 'MEDIUM')) {
    return 'PARTIAL'
  }
  return 'SUPPORTED'
}

export function resolveDerivedStatus(args: {
  required: readonly FactId[]
  found: readonly FactEnvelope[]
  blockedFactIds: ReadonlySet<FactId>
}): DerivedKpiStatus {
  const { required, found, blockedFactIds } = args
  const foundIds = new Set(found.map((f) => f.factId))

  for (const id of required) {
    if (blockedFactIds.has(id)) return 'BLOCKED'
    if (!foundIds.has(id)) return 'UNAVAILABLE'
  }

  if (found.some((f) => f.confidence === 'UNSUPPORTED' || f.operationalConfidence <= 0)) {
    return 'BLOCKED'
  }

  if (
    found.some(
      (f) =>
        f.readiness === 'PARTIAL' ||
        f.readiness === 'BLOCKED' ||
        f.confidence === 'MEDIUM' ||
        f.confidence === 'LOW',
    )
  ) {
    return 'PARTIAL'
  }

  return 'SUPPORTED'
}
