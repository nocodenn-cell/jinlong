import { describe, expect, it, vi } from 'vitest'
import type { DecisionIntelligenceReadModel } from '@/lib/decision-intelligence'
import { loadIntelligenceReadModel } from './loadIntelligenceReadModel'

function stubModel(storeId: string): DecisionIntelligenceReadModel {
  return {
    storeId,
    projectedAt: '2026-07-19T22:00:00.000Z',
    snapshotRequestedAt: null,
    executiveDashboard: {
      storeId,
      composedAt: '',
      headlineCodes: [],
      operationalConfidence: 0,
      kpiSummary: { supported: 0, partial: 0, blocked: 0, highlightKpiIds: [] },
      findingSummary: { count: 0, critical: 0, warning: 0, info: 0 },
      alertSummary: { count: 0, critical: 0, warning: 0, info: 0 },
      recommendationCount: 0,
      actionPlanCount: 0,
      decisionCounts: {
        accepted: 0,
        rejected: 0,
        deferred: 0,
        executed: 0,
        total: 0,
      },
      topAlertIds: [],
      topActionPlanIds: [],
      snapshotVersion: null,
    },
    recommendationQueue: { storeId, items: [], openCount: 0, decidedCount: 0 },
    criticalAlerts: { storeId, items: [] },
    dailyActionPlan: { storeId, planDate: null, plans: [] },
    decisionHistory: { storeId, items: [] },
    decisionPerformance: { storeId, samples: [], sampleCount: 0 },
    pendingReviews: { storeId, items: [] },
    governedMemory: { storeId, items: [], entryCount: 0 },
  }
}

describe('loadIntelligenceReadModel', () => {
  it('delega exclusivamente à DecisionReadModelPort', async () => {
    const model = stubModel('loja-ui-1')
    const getForLoja = vi.fn().mockResolvedValue(model)
    const result = await loadIntelligenceReadModel('loja-ui-1', { getForLoja })
    expect(getForLoja).toHaveBeenCalledWith('loja-ui-1')
    expect(result).toBe(model)
  })

  it('retorna null para lojaId vazio sem chamar a porta', async () => {
    const getForLoja = vi.fn()
    const result = await loadIntelligenceReadModel('  ', { getForLoja })
    expect(result).toBeNull()
    expect(getForLoja).not.toHaveBeenCalled()
  })
})
