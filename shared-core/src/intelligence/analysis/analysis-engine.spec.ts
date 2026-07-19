import { describe, expect, it } from 'vitest'
import {
  deriveKpis,
  envelopeStub,
  listAnalysisRuleIds,
  runAnalysisEngine,
  type DerivedKpi,
} from '../index'

function kpi(
  partial: Pick<DerivedKpi, 'id' | 'status' | 'value' | 'operationalConfidence'> &
    Partial<DerivedKpi>,
): DerivedKpi {
  const supportLevel =
    partial.supportLevel ??
    (partial.status === 'PARTIAL'
      ? 'PARTIAL'
      : partial.status === 'BLOCKED' || partial.status === 'UNAVAILABLE'
        ? 'UNSUPPORTED'
        : 'SUPPORTED')
  const confidence =
    partial.confidence ??
    (partial.status === 'PARTIAL'
      ? 'MEDIUM'
      : partial.status === 'SUPPORTED'
        ? 'HIGH'
        : 'UNSUPPORTED')
  return {
    nameCode: `intel.kpi.${partial.id}.name`,
    descriptionCode: `intel.kpi.${partial.id}.desc`,
    owner: 'financial',
    requiredFacts: [],
    formulaVersion: '1.0.0',
    inputFingerprint: `${partial.id}:t`,
    computedAt: '2026-07-19T18:00:00.000Z',
    usedFactIds: partial.usedFactIds ?? ['SaleFact'],
    supportLevel,
    confidence,
    ...partial,
  }
}

describe('Analysis Engine (Cycle 3)', () => {
  it('registry de regras está carregado', () => {
    expect(listAnalysisRuleIds()).toEqual(
      expect.arrayContaining(['LOW_MARGIN', 'ZERO_NET_REVENUE', 'LOW_INVENTORY_TURNOVER']),
    )
  })

  it('emite LOW_MARGIN WARNING sem recomendar ação', () => {
    const snapshot = runAnalysisEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      derivedKpis: [
        kpi({
          id: 'GrossMargin',
          status: 'SUPPORTED',
          value: 0.12,
          operationalConfidence: 0.95,
        }),
      ],
    })

    const finding = snapshot.findings.find((f) => f.id === 'LOW_MARGIN')
    expect(finding).toBeDefined()
    expect(finding?.severity).toBe('WARNING')
    expect(finding?.domain).toBe('MARGIN')
    expect(finding?.titleCode).toBe('intel.analysis.low_margin.title')
    expect(finding?.operationalConfidence).toBe(0.95)
    expect(finding?.sourceFactIds).toContain('SaleFact')
    expect(finding?.evidence.length).toBeGreaterThan(0)
    expect(finding?.evidence[0]?.kpiId).toBe('GrossMargin')
    // Não é recommendation / action
    expect(JSON.stringify(finding)).not.toMatch(/aumente|preço|price/i)
  })

  it('propaga confidence pelo mínimo dos KPIs de evidência', () => {
    const snapshot = runAnalysisEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      derivedKpis: [
        kpi({
          id: 'GrossMargin',
          status: 'PARTIAL',
          value: 0.05,
          operationalConfidence: 0.72,
        }),
      ],
    })
    const finding = snapshot.findings.find((f) => f.id === 'LOW_MARGIN')
    expect(finding?.severity).toBe('CRITICAL')
    expect(finding?.operationalConfidence).toBe(0.72)
  })

  it('não emite finding quando KPI está BLOCKED/UNAVAILABLE (dados insuficientes)', () => {
    const snapshot = runAnalysisEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      derivedKpis: [
        kpi({
          id: 'GrossMargin',
          status: 'BLOCKED',
          value: null,
          operationalConfidence: 0,
          supportLevel: 'UNSUPPORTED',
          confidence: 'UNSUPPORTED',
        }),
        kpi({
          id: 'NetRevenue',
          status: 'UNAVAILABLE',
          value: null,
          operationalConfidence: 0,
          supportLevel: 'UNSUPPORTED',
          confidence: 'UNSUPPORTED',
        }),
      ],
    })

    expect(snapshot.findings.some((f) => f.id === 'LOW_MARGIN')).toBe(false)
    expect(snapshot.findings.some((f) => f.id === 'ZERO_NET_REVENUE')).toBe(false)
    expect(snapshot.skippedInsufficientData).toBeGreaterThan(0)
  })

  it('toda finding tem evidência e sourceFactIds', () => {
    const snapshot = runAnalysisEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      derivedKpis: [
        kpi({
          id: 'NetRevenue',
          status: 'SUPPORTED',
          value: 0,
          operationalConfidence: 1,
          usedFactIds: ['SaleFact'],
        }),
      ],
    })
    for (const f of snapshot.findings) {
      expect(f.evidence.length).toBeGreaterThan(0)
      expect(f.sourceFactIds.length).toBeGreaterThan(0)
    }
  })

  it('integra com deriveKpis sem criar recommendations', () => {
    const kpis = deriveKpis({
      storeId: 'loja-1',
      factsUsed: [
        envelopeStub({
          factId: 'SaleFact',
          owner: 'sales',
          readiness: 'READY',
          confidence: 'HIGH',
          operationalConfidence: 1,
          payload: { grossAmount: 100, netAmount: 0 },
        }),
      ],
      factsPartialIdentified: [
        envelopeStub({
          factId: 'MarginFact',
          owner: 'sales',
          readiness: 'PARTIAL',
          confidence: 'MEDIUM',
          operationalConfidence: 0.8,
          payload: { netRevenue: 100, estimatedCost: 90, costReliable: true },
        }),
      ],
      factsBlocked: [],
      requestedAt: '2026-07-19T18:00:00.000Z',
    })

    const analysis = runAnalysisEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      derivedKpis: kpis.derivedKpis,
    })

    expect(analysis.findings.some((f) => f.id === 'ZERO_NET_REVENUE')).toBe(true)
    expect(analysis.findings.some((f) => f.id === 'LOW_MARGIN')).toBe(true)
  })
})
