import { describe, expect, it } from 'vitest'
import {
  fixtureActionPlan,
  fixtureAlert,
  fixtureMemorySnapshot,
  fixtureRecommendation,
} from '../testing'
import { assertExecutiveDeterminism, runExecutiveEngine } from './index'

describe('Executive Engine (Cycle 8)', () => {
  it('compõe resumo sem Facts e sem inflar confidence', () => {
    const rec = fixtureRecommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_INVENTORY_CAPITAL',
      urgency: 'P1',
      operationalConfidence: 0.85,
      sourceFindingIds: ['LOW_INVENTORY_TURNOVER'],
      category: 'INVENTORY',
      problemCode: 'LOW_INVENTORY_TURNOVER',
      recommendedAction: { actionCode: 'REVIEW_INVENTORY_CAPITAL' },
    })
    const alert = fixtureAlert({
      id: 'alert:1',
      sourceRecommendationIds: [rec.id],
      sourceFindingIds: [...rec.sourceFindingIds],
      operationalConfidence: 0.85,
    })
    const actionPlans = [
      fixtureActionPlan(
        { id: 'plan:1', objectiveCode: 'REVIEW_INVENTORY_CAPITAL' },
        [rec],
        [alert],
      ),
    ]
    const memory = fixtureMemorySnapshot({
      operationalConfidence: 0.85,
      sourceRecommendationIds: [rec.id],
      sourceAlertIds: [alert.id],
      sourceActionPlanIds: [actionPlans[0]!.id],
    })

    const executive = runExecutiveEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      supportedKpis: [],
      partialKpis: [],
      blockedKpis: [],
      findings: [],
      recommendations: [rec],
      alerts: [alert],
      actionPlans,
      memory,
    })

    expect(executive.recommendationSummary.count).toBe(1)
    expect(executive.alertSummary.count).toBe(1)
    expect(executive.actionPlanSummary.planCount).toBe(1)
    expect(executive.operationalConfidence).toBeLessThanOrEqual(0.85)
    expect(JSON.stringify(executive)).not.toMatch(/FactEnvelope|factsUsed/)
    expect(() => assertExecutiveDeterminism(executive)).not.toThrow()
  })
})
