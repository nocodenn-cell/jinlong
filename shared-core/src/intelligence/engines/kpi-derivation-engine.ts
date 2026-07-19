import type { DerivedKpi } from '../contracts/derived-kpi'
import type { FactEnvelope } from '../contracts/fact'
import type { KpiValue } from '../contracts/kpi'
import type { BlockedFactRecord } from '../contracts/decision-snapshot'
import type { FactId } from '../facts/definitions'
import {
  inferSupportLevelFromFacts,
  operationalToConfidenceLevel,
  propagateOperationalConfidence,
  resolveDerivedStatus,
} from '../kpi/confidence'
import { computeKpiValue } from '../kpi/formulas'
import {
  KPI_IDS,
  KPI_REGISTRY,
  type CatalogKpiId,
} from '../kpi/registry'

export type KpiDerivationInput = {
  storeId: string
  /** Facts SUPPORTED (factsUsed). */
  factsUsed: readonly FactEnvelope[]
  /** Facts PARTIAL identificados. */
  factsPartialIdentified: readonly FactEnvelope[]
  factsBlocked: readonly BlockedFactRecord[]
  requestedAt: string
}

export type KpiDerivationResult = {
  derivedKpis: DerivedKpi[]
  supportedKpis: DerivedKpi[]
  partialKpis: DerivedKpi[]
  blockedKpis: DerivedKpi[]
  /** Compat downstream: só SUPPORTED + PARTIAL com value. */
  kpiValues: KpiValue[]
}

function indexByFactId(facts: readonly FactEnvelope[]): Map<FactId, FactEnvelope[]> {
  const map = new Map<FactId, FactEnvelope[]>()
  for (const f of facts) {
    const list = map.get(f.factId) ?? []
    list.push(f)
    map.set(f.factId, list)
  }
  return map
}

function pickRequired(
  required: readonly FactId[],
  index: Map<FactId, FactEnvelope[]>,
): FactEnvelope[] {
  const out: FactEnvelope[] = []
  for (const id of required) {
    const list = index.get(id)
    if (!list || list.length === 0) continue
    out.push(...list)
  }
  return out
}

function fingerprint(facts: readonly FactEnvelope[], kpiId: string): string {
  const parts = facts.map((f) => f.inputFingerprint).sort()
  return `${kpiId}:${parts.join('|')}`
}

function toKpiValue(d: DerivedKpi): KpiValue {
  return {
    kpiId: d.id,
    formulaVersion: d.formulaVersion,
    value: d.value,
    unit: d.unit,
    currency: d.currency,
    computedAt: d.computedAt,
    inputFingerprint: d.inputFingerprint,
    confidence: d.confidence,
  }
}

function deriveOne(
  kpiId: CatalogKpiId,
  index: Map<FactId, FactEnvelope[]>,
  blockedFactIds: ReadonlySet<FactId>,
  requestedAt: string,
): DerivedKpi {
  const def = KPI_REGISTRY[kpiId]
  const found = pickRequired(def.requiredFacts, index)
  const status = resolveDerivedStatus({
    required: def.requiredFacts,
    found,
    blockedFactIds,
  })

  const allRequiredPresent = def.requiredFacts.every((id) =>
    found.some((f) => f.factId === id),
  )

  if (status === 'BLOCKED') {
    return finishBlocked(def, found, requestedAt, 'intel.kpi.blocked_unsupported_fact')
  }
  if (status === 'UNAVAILABLE') {
    return finishUnavailable(def, found, requestedAt, 'intel.kpi.fact_missing')
  }

  // SUPPORTED | PARTIAL
  if (!allRequiredPresent) {
    return finishUnavailable(def, found, requestedAt, 'intel.kpi.fact_missing')
  }

  const value = computeKpiValue(kpiId, found)
  if (value === null) {
    return finishUnavailable(def, found, requestedAt, 'intel.kpi.payload_insufficient')
  }

  const operational = propagateOperationalConfidence(found)
  const supportLevel = inferSupportLevelFromFacts(found, status)

  return {
    id: def.id,
    nameCode: def.nameCode,
    descriptionCode: def.descriptionCode,
    owner: def.owner,
    requiredFacts: def.requiredFacts,
    supportLevel,
    status,
    operationalConfidence: operational,
    confidence: operationalToConfidenceLevel(operational, status),
    value,
    unit: def.unit,
    currency: def.currency,
    formulaVersion: def.formulaVersion,
    inputFingerprint: fingerprint(found, def.id),
    computedAt: requestedAt,
    usedFactIds: found.map((f) => f.factId),
  }
}

function finishBlocked(
  def: (typeof KPI_REGISTRY)[CatalogKpiId],
  found: FactEnvelope[],
  requestedAt: string,
  reason: string,
): DerivedKpi {
  return {
    id: def.id,
    nameCode: def.nameCode,
    descriptionCode: def.descriptionCode,
    owner: def.owner,
    requiredFacts: def.requiredFacts,
    supportLevel: 'UNSUPPORTED',
    status: 'BLOCKED',
    operationalConfidence: 0,
    confidence: 'UNSUPPORTED',
    value: null,
    unit: def.unit,
    currency: def.currency,
    formulaVersion: def.formulaVersion,
    inputFingerprint: fingerprint(found, def.id),
    computedAt: requestedAt,
    usedFactIds: found.map((f) => f.factId),
    blockedReasonCode: reason,
  }
}

function finishUnavailable(
  def: (typeof KPI_REGISTRY)[CatalogKpiId],
  found: FactEnvelope[],
  requestedAt: string,
  reason: string,
): DerivedKpi {
  return {
    id: def.id,
    nameCode: def.nameCode,
    descriptionCode: def.descriptionCode,
    owner: def.owner,
    requiredFacts: def.requiredFacts,
    supportLevel: 'UNSUPPORTED',
    status: 'UNAVAILABLE',
    operationalConfidence: 0,
    confidence: 'UNSUPPORTED',
    value: null,
    unit: def.unit,
    currency: def.currency,
    formulaVersion: def.formulaVersion,
    inputFingerprint: fingerprint(found, def.id),
    computedAt: requestedAt,
    usedFactIds: found.map((f) => f.factId),
    blockedReasonCode: reason,
  }
}

/**
 * KPI Derivation Engine — puro.
 * Facts → DerivedKPIs. Sem SQL / Supabase / React.
 */
export function deriveKpis(input: KpiDerivationInput): KpiDerivationResult {
  const pool = [...input.factsUsed, ...input.factsPartialIdentified]
  const index = indexByFactId(pool)
  const blockedFactIds = new Set(input.factsBlocked.map((b) => b.factId))

  const derivedKpis = KPI_IDS.map((id) =>
    deriveOne(id, index, blockedFactIds, input.requestedAt),
  )

  const supportedKpis = derivedKpis.filter((k) => k.status === 'SUPPORTED')
  const partialKpis = derivedKpis.filter((k) => k.status === 'PARTIAL')
  const blockedKpis = derivedKpis.filter(
    (k) => k.status === 'BLOCKED' || k.status === 'UNAVAILABLE',
  )

  const kpiValues = [...supportedKpis, ...partialKpis]
    .filter((k) => k.value !== null)
    .map(toKpiValue)

  return { derivedKpis, supportedKpis, partialKpis, blockedKpis, kpiValues }
}
