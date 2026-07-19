import type { DerivedKpi } from '../contracts/derived-kpi'
import type { KpiId } from '../contracts/kpi'
import type { AnalysisEvidence } from './types'

/** KPI utilizável em finding (tem valor numérico). */
export function usableKpi(
  byId: ReadonlyMap<KpiId, DerivedKpi>,
  kpiId: KpiId,
): DerivedKpi | null {
  const k = byId.get(kpiId)
  if (!k) return null
  if (k.status === 'BLOCKED' || k.status === 'UNAVAILABLE') return null
  if (k.value === null || typeof k.value !== 'number') return null
  return k
}

export function evidenceFrom(kpi: DerivedKpi): AnalysisEvidence {
  return {
    kpiId: kpi.id,
    value: kpi.value,
    kpiStatus: kpi.status,
  }
}

export function minConfidence(kpis: readonly DerivedKpi[]): number {
  if (kpis.length === 0) return 0
  let min = 1
  for (const k of kpis) {
    if (k.operationalConfidence < min) min = k.operationalConfidence
  }
  return Math.round(min * 1000) / 1000
}
