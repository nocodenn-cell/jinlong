import { describe, expect, it } from 'vitest'
import {
  findingsForRecommendations,
  fixtureAlert,
  fixtureRecommendation,
} from '../testing'
import {
  assertActionPlanDeterminism,
  runActionPlanEngine,
} from './index'

describe('Action Plan Engine (Cycle 6)', () => {
  it('agrega múltiplos alerts do mesmo objetivo em um único plano', () => {
    const recA = fixtureRecommendation({
      id: 'rec:margin:a',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P1',
      operationalConfidence: 0.9,
      sourceFindingIds: ['LOW_MARGIN'],
    })
    const recB = fixtureRecommendation({
      id: 'rec:margin:b',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P0',
      operationalConfidence: 0.8,
      sourceFindingIds: ['NEGATIVE_GROSS_PROFIT'],
      problemCode: 'NEGATIVE_GROSS_PROFIT',
    })
    const alerts = [
      fixtureAlert({
        id: 'alert:a',
        sourceRecommendationIds: [recA.id],
        sourceFindingIds: [...recA.sourceFindingIds],
        operationalConfidence: 0.9,
      }),
      fixtureAlert({
        id: 'alert:b',
        sourceRecommendationIds: [recB.id],
        sourceFindingIds: [...recB.sourceFindingIds],
        operationalConfidence: 0.8,
        severity: 'CRITICAL',
        urgency: { score: 90, reason: 'intel.alert.urgency.from_tier.P0' },
      }),
    ]

    const snapshot = runActionPlanEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      alerts,
      recommendations: [recA, recB],
      findings: findingsForRecommendations([recA, recB]),
    })

    expect(snapshot.actionPlans).toHaveLength(1)
    const plan = snapshot.actionPlans[0]!
    expect(plan.objectiveCode).toBe('REVIEW_CRITICAL_MARGINS')
    expect(plan.items).toHaveLength(2)
    expect(plan.sourceAlertIds).toHaveLength(2)
    expect(plan.items[0]?.sourceFindingIds.length).toBeGreaterThan(0)
    expect(plan.items[0]?.sourceAlertIds.length).toBeGreaterThan(0)
    expect(plan.operationalConfidence).toBe(0.8)
    expect(() => assertActionPlanDeterminism(plan)).not.toThrow()
  })

  it('exige findings no catálogo (W4)', () => {
    const rec = fixtureRecommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P1',
      operationalConfidence: 0.9,
    })
    const alerts = [
      fixtureAlert({
        id: 'alert:1',
        sourceRecommendationIds: [rec.id],
        sourceFindingIds: [...rec.sourceFindingIds],
      }),
    ]
    expect(() =>
      runActionPlanEngine({
        storeId: 'loja-1',
        requestedAt: '2026-07-19T18:00:00.000Z',
        alerts,
        recommendations: [rec],
        findings: [],
      }),
    ).toThrow(/INTEL_PLAN_FINDINGS_REQUIRED/)
  })

  it('não inflaciona confidence acima do mínimo das fontes', () => {
    const rec = fixtureRecommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_SALES_ACTIVITY',
      urgency: 'P1',
      operationalConfidence: 0.55,
      sourceFindingIds: ['ZERO_NET_REVENUE'],
      problemCode: 'ZERO_NET_REVENUE',
      category: 'SALES',
    })
    const alerts = [
      fixtureAlert({
        id: 'alert:1',
        sourceRecommendationIds: [rec.id],
        sourceFindingIds: [...rec.sourceFindingIds],
        operationalConfidence: 0.55,
      }),
    ]
    const plan = runActionPlanEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      alerts,
      recommendations: [rec],
      findings: findingsForRecommendations([rec]),
    }).actionPlans[0]!

    expect(plan.operationalConfidence).toBe(0.55)
  })

  it('rejeita action codes de mutação', () => {
    const rec = fixtureRecommendation({
      id: 'rec:bad',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P1',
      operationalConfidence: 0.9,
      recommendedAction: { actionCode: 'update_price' },
    })
    const alerts = [
      fixtureAlert({
        id: 'alert:1',
        sourceRecommendationIds: [rec.id],
        sourceFindingIds: [...rec.sourceFindingIds],
      }),
    ]
    expect(() =>
      runActionPlanEngine({
        storeId: 'loja-1',
        requestedAt: '2026-07-19T18:00:00.000Z',
        alerts,
        recommendations: [rec],
        findings: findingsForRecommendations([rec]),
      }),
    ).toThrow(/INTEL_PLAN_FORBIDDEN_ACTION|INTEL_PLAN_NOT_ORGANIZING/)
  })

  it('objetivos distintos geram planos distintos', () => {
    const margin = fixtureRecommendation({
      id: 'rec:m',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P1',
      operationalConfidence: 0.9,
    })
    const sales = fixtureRecommendation({
      id: 'rec:s',
      recommendationCode: 'REVIEW_SALES_ACTIVITY',
      urgency: 'P1',
      operationalConfidence: 0.9,
      sourceFindingIds: ['ZERO_NET_REVENUE'],
      category: 'SALES',
      problemCode: 'ZERO_NET_REVENUE',
    })
    const alerts = [
      fixtureAlert({
        id: 'alert:m',
        sourceRecommendationIds: [margin.id],
        sourceFindingIds: [...margin.sourceFindingIds],
      }),
      fixtureAlert({
        id: 'alert:s',
        sourceRecommendationIds: [sales.id],
        sourceFindingIds: [...sales.sourceFindingIds],
      }),
    ]
    const snapshot = runActionPlanEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      alerts,
      recommendations: [margin, sales],
      findings: findingsForRecommendations([margin, sales]),
    })
    expect(snapshot.actionPlans).toHaveLength(2)
  })
})
