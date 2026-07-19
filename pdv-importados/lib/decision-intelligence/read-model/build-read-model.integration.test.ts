import { describe, expect, it } from 'vitest'
import {
  WAVE_A_DESCRIPTORS,
  createInMemoryFactProvider,
  envelopeStub,
  runEngineLoop,
} from '@shared-core/src/intelligence'
import { createInMemoryDecisionRecordRepository } from '../adapters/in-memory-decision-record-repository'
import { createInMemoryDecisionSnapshotRepository } from '../adapters/in-memory-decision-snapshot-repository'
import { createDecisionReadModelAdapter } from '../adapters/decision-read-model-adapter'
import { persistDecisionSnapshot } from '../persist-decision-snapshot'
import { buildDecisionIntelligenceReadModel } from './build-read-model'

describe('Decision Intelligence Read Model (Fase 3)', () => {
  it('projeta Executive/Queue/Alerts/Plans sem recalcular regras', async () => {
    const snapshot = await runEngineLoop({
      storeId: 'loja-rm-1',
      providers: [
        createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [
          envelopeStub({
            factId: 'SaleFact',
            owner: 'sales',
            readiness: 'READY',
            storeId: 'loja-rm-1',
            confidence: 'HIGH',
            operationalConfidence: 1,
            inputFingerprint: 'sale:rm',
            payload: { grossAmount: 100, netAmount: 0 },
          }),
        ]),
      ],
      now: () => new Date('2026-07-19T21:00:00.000Z'),
    })

    const rm = buildDecisionIntelligenceReadModel({
      snapshot,
      records: [],
      snapshotVersion: 'di-core-v1.0',
      projectedAt: '2026-07-19T21:05:00.000Z',
    })

    expect(rm.executiveDashboard.storeId).toBe('loja-rm-1')
    expect(rm.executiveDashboard.snapshotVersion).toBe('di-core-v1.0')
    expect(rm.executiveDashboard.headlineCodes).toEqual(
      snapshot.executive.headlineCodes,
    )
    expect(rm.executiveDashboard.operationalConfidence).toBe(
      snapshot.executive.operationalConfidence,
    )
    expect(rm.recommendationQueue.items.length).toBe(
      snapshot.recommendations.length,
    )
    expect(rm.criticalAlerts.items.every((a) => a.severity === 'CRITICAL')).toBe(
      true,
    )
    expect(rm.dailyActionPlan.plans.length).toBe(snapshot.actionPlans.length)
    // Projeção não inventa campos de regra
    expect(JSON.stringify(rm)).not.toMatch(/ruleId|formulaVersion|deriveKpi/)
  })

  it('CriticalAlerts só espelha severity já definida no Core', async () => {
    const snapshot = await runEngineLoop({
      storeId: 'loja-rm-2',
      providers: [
        createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [
          envelopeStub({
            factId: 'SaleFact',
            owner: 'sales',
            readiness: 'READY',
            confidence: 'HIGH',
            operationalConfidence: 1,
          }),
        ]),
      ],
    })
    const coreCriticalIds = new Set(
      snapshot.alerts.filter((a) => a.severity === 'CRITICAL').map((a) => a.id),
    )
    const rm = buildDecisionIntelligenceReadModel({
      snapshot,
      records: [],
    })
    for (const item of rm.criticalAlerts.items) {
      expect(coreCriticalIds.has(item.alertId)).toBe(true)
    }
  })

  it('junta DecisionRecord à RecommendationQueue e History/Performance/Pending', () => {
    const snapshot = {
      storeId: 'loja-rm-3',
      timestamp: '2026-07-19T21:00:00.000Z',
      recommendations: [
        {
          id: 'rec:open',
          recommendationCode: 'REVIEW_MARGIN_DRIVERS',
          problemCode: 'LOW_MARGIN',
          urgency: 'P1',
          operationalConfidence: 0.9,
          sourceFindingIds: ['LOW_MARGIN'],
          recommendedAction: { actionCode: 'REVIEW_MARGIN_DRIVERS' },
        },
        {
          id: 'rec:decided',
          recommendationCode: 'REVIEW_SALES_ACTIVITY',
          problemCode: 'ZERO_NET_REVENUE',
          urgency: 'P1',
          operationalConfidence: 0.8,
          sourceFindingIds: ['ZERO_NET_REVENUE'],
          recommendedAction: { actionCode: 'REVIEW_SALES_ACTIVITY' },
        },
      ],
      alerts: [
        {
          id: 'alert:crit',
          titleCode: 't',
          severity: 'CRITICAL',
          urgency: { score: 90, reason: 'r' },
          operationalConfidence: 0.4,
          sourceRecommendationIds: ['rec:open'],
          sourceFindingIds: ['LOW_MARGIN'],
        },
        {
          id: 'alert:warn',
          titleCode: 't2',
          severity: 'WARNING',
          urgency: { score: 70, reason: 'r' },
          operationalConfidence: 0.8,
          sourceRecommendationIds: ['rec:decided'],
          sourceFindingIds: ['ZERO_NET_REVENUE'],
        },
      ],
      actionPlans: [],
      executive: {
        composedAt: '2026-07-19T21:00:00.000Z',
        headlineCodes: ['intel.executive.headline.critical_alerts'],
        operationalConfidence: 0.4,
        kpiSummary: {
          supported: 0,
          partial: 0,
          blocked: 0,
          highlightKpiIds: [],
        },
        findingSummary: { count: 0, critical: 0, warning: 0, info: 0 },
        alertSummary: { count: 2, critical: 1, warning: 1, info: 0 },
        recommendationSummary: { count: 2, codes: [] },
        actionPlanSummary: {
          planCount: 0,
          itemCount: 0,
          objectiveCodes: [],
        },
        topAlertIds: ['alert:crit'],
        topActionPlanIds: [],
      },
    }

    const records = [
      {
        id: 'dec:1',
        lojaId: 'loja-rm-3',
        recommendationId: 'rec:decided',
        snapshotId: null,
        status: 'accepted' as const,
        decisionReason: 'BUSINESS_POLICY' as const,
        decisionAt: '2026-07-19T22:00:00.000Z',
        actorId: null,
        reviewDate: null,
        expectedOutcome: {
          metricCode: 'GrossMargin',
          value: 0.04,
          unit: 'ratio_delta',
        },
        actualOutcome: {
          metricCode: 'GrossMargin',
          value: 0.036,
          unit: 'ratio_delta',
          measuredAt: '2026-08-18T00:00:00.000Z',
        },
        outcomes: {
          d30: {
            status: 'RECORDED' as const,
            measuredAt: '2026-08-18T00:00:00.000Z',
            actual: {
              metricCode: 'GrossMargin',
              value: 0.036,
              unit: 'ratio_delta',
            },
          },
          d60: { status: 'PENDING' as const },
          d90: { status: 'PENDING' as const },
        },
        actionPlanItemIds: [],
        notes: null,
        createdAt: '2026-07-19T22:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
      {
        id: 'dec:2',
        lojaId: 'loja-rm-3',
        recommendationId: 'rec:other',
        snapshotId: null,
        status: 'deferred' as const,
        decisionReason: 'SEASONAL' as const,
        decisionAt: '2026-07-19T23:00:00.000Z',
        actorId: null,
        reviewDate: '2026-08-01',
        expectedOutcome: null,
        actualOutcome: null,
        outcomes: {
          d30: { status: 'PENDING' as const },
          d60: { status: 'PENDING' as const },
          d90: { status: 'PENDING' as const },
        },
        actionPlanItemIds: [],
        notes: null,
        createdAt: '2026-07-19T23:00:00.000Z',
        updatedAt: '2026-07-19T23:00:00.000Z',
      },
    ]

    const rm = buildDecisionIntelligenceReadModel({
      snapshot: snapshot as never,
      records,
    })

    expect(rm.criticalAlerts.items).toHaveLength(1)
    expect(rm.criticalAlerts.items[0]?.alertId).toBe('alert:crit')

    const open = rm.recommendationQueue.items.find(
      (i) => i.recommendationId === 'rec:open',
    )
    const decided = rm.recommendationQueue.items.find(
      (i) => i.recommendationId === 'rec:decided',
    )
    expect(open?.decisionStatus).toBeNull()
    expect(decided?.decisionStatus).toBe('accepted')
    expect(rm.recommendationQueue.openCount).toBe(1)
    expect(rm.recommendationQueue.decidedCount).toBe(1)

    expect(rm.decisionHistory.items).toHaveLength(2)
    expect(rm.decisionPerformance.sampleCount).toBe(1)
    expect(rm.decisionPerformance.samples[0]?.storedDelta).toBeCloseTo(-0.004)

    expect(
      rm.pendingReviews.items.some(
        (i) =>
          i.kind === 'UNDECIDED_RECOMMENDATION' &&
          i.recommendationId === 'rec:open',
      ),
    ).toBe(true)
    expect(
      rm.pendingReviews.items.some(
        (i) => i.kind === 'DEFERRED_REVIEW' && i.decisionId === 'dec:2',
      ),
    ).toBe(true)

    expect(rm.executiveDashboard.decisionCounts.accepted).toBe(1)
    expect(rm.executiveDashboard.decisionCounts.deferred).toBe(1)
  })

  it('adapter carrega repos e projeta (sem lógica de negócio)', async () => {
    const snapshots = createInMemoryDecisionSnapshotRepository()
    const decisions = createInMemoryDecisionRecordRepository()
    const snapshot = await runEngineLoop({
      storeId: 'loja-rm-4',
      providers: [
        createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [
          envelopeStub({
            factId: 'SaleFact',
            owner: 'sales',
            readiness: 'READY',
            confidence: 'HIGH',
            operationalConfidence: 1,
          }),
        ]),
      ],
    })
    await persistDecisionSnapshot({ repository: snapshots, snapshot })
    await decisions.create({
      lojaId: 'loja-rm-4',
      recommendationId: 'rec:x',
      status: 'rejected',
      decisionReason: 'OUT_OF_STOCK',
    })

    const port = createDecisionReadModelAdapter({ snapshots, decisions })
    const rm = await port.getForLoja('loja-rm-4')
    expect(rm).not.toBeNull()
    expect(rm?.storeId).toBe('loja-rm-4')
    expect(rm?.decisionHistory.items).toHaveLength(1)
    expect(rm?.executiveDashboard.decisionCounts.rejected).toBe(1)
  })
})
