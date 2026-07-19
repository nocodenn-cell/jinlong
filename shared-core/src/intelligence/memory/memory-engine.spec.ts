import { describe, expect, it } from 'vitest'
import { summarizeFactConfidence } from '../contracts/recommendation-purity'
import {
  fixtureActionPlan,
  fixtureAlert,
  fixtureFinding,
  fixtureRecommendation,
} from '../testing'
import { assertMemoryDeterminism, runMemoryEngine } from './index'

describe('Memory Engine (Cycle 7)', () => {
  it('entries granulares referenciam só artefatos do evento', () => {
    const rec = fixtureRecommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P0',
      operationalConfidence: 0.7,
      sourceFindingIds: ['LOW_MARGIN'],
    })
    const alert = fixtureAlert({
      id: 'alert:1',
      sourceRecommendationIds: [rec.id],
      sourceFindingIds: ['LOW_MARGIN'],
      operationalConfidence: 0.7,
      severity: 'CRITICAL',
      urgency: { score: 90, reason: 'intel.alert.urgency.from_tier.P0' },
    })
    const plan = fixtureActionPlan(
      { id: 'plan:1', objectiveCode: 'REVIEW_CRITICAL_MARGINS' },
      [rec],
      [alert],
    )

    const memory = runMemoryEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      findings: [
        fixtureFinding({
          id: 'LOW_MARGIN',
          severity: 'CRITICAL',
          domain: 'MARGIN',
          operationalConfidence: 0.7,
        }),
      ],
      recommendations: [rec],
      alerts: [alert],
      actionPlans: [plan],
      confidenceSummary: summarizeFactConfidence([]),
    })

    const recEntry = memory.entries.find((e) => e.id.includes('rec:1'))
    expect(recEntry?.relatedRecommendationIds).toEqual([rec.id])
    expect(recEntry?.relatedFindingIds).toEqual(['LOW_MARGIN'])
    expect(recEntry?.relatedAlertIds).toEqual([alert.id])
    expect(recEntry?.relatedActionPlanIds).toEqual([plan.id])

    const ctx = memory.entries.find((e) => e.kind === 'CONTEXT')
    expect(ctx?.relatedRecommendationIds).toEqual([])
    expect(ctx?.relatedAlertIds).toEqual([])

    expect(memory.operationalConfidence).toBe(0.7)
    expect(() => assertMemoryDeterminism(memory)).not.toThrow()
  })

  it('não muta action plans de entrada', () => {
    const plans = [
      fixtureActionPlan({
        id: 'plan:x',
        objectiveCode: 'REVIEW_CRITICAL_MARGINS',
      }),
    ]
    const before = structuredClone(plans)
    runMemoryEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      findings: [],
      recommendations: [],
      alerts: [],
      actionPlans: plans,
      confidenceSummary: summarizeFactConfidence([]),
    })
    expect(plans).toEqual(before)
  })
})
