import { describe, expect, it } from 'vitest'
import type { AnalysisFinding } from '../contracts/analysis'
import type { Recommendation } from '../contracts/recommendation'
import {
  FORBIDDEN_OPERATIONAL_ACTION_CODES,
  isForbiddenOperationalAction,
} from '../policy'
import { assertRecommendationDeterminism } from './determinism'
import {
  createRecommendationEngine,
  runRecommendationEngine,
} from './recommendation-engine'
import { listRecommendationRuleIds } from './recommendation-registry'
import { buildRecommendationFromFinding } from './build-recommendation'

function finding(
  partial: Pick<AnalysisFinding, 'id' | 'severity' | 'domain' | 'confidence'> &
    Partial<AnalysisFinding>,
): AnalysisFinding {
  return {
    titleCode: `intel.analysis.${partial.id.toLowerCase()}.title`,
    evidence: [
      {
        kpiId: 'GrossMargin',
        value: 0.12,
        kpiStatus: 'SUPPORTED',
      },
    ],
    ...partial,
  }
}

describe('Recommendation Engine (Cycle 4)', () => {
  it('registry de regras de revisão está carregado', () => {
    expect(listRecommendationRuleIds()).toEqual(
      expect.arrayContaining([
        'REC_REVIEW_MARGIN_DRIVERS',
        'REC_REVIEW_SALES_ACTIVITY',
        'REC_REVIEW_INVENTORY_CAPITAL',
      ]),
    )
  })

  it('não inflaciona confidence: Rec.operationalConfidence === Finding.confidence', () => {
    const lowMargin = finding({
      id: 'LOW_MARGIN',
      severity: 'WARNING',
      domain: 'MARGIN',
      confidence: 0.72,
    })
    const snapshot = runRecommendationEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      findings: [lowMargin],
      derivedKpis: [],
    })
    const rec = snapshot.recommendations[0]!
    expect(rec.operationalConfidence).toBe(0.72)
    expect(rec.operationalConfidence).toBe(lowMargin.confidence)
    expect(rec.ruleId).toBeTruthy()
    expect(rec.ruleVersion).toBe('1.0.0')
  })

  it('LOW_MARGIN → REVIEW_MARGIN_DRIVERS com rastreabilidade Finding→KPI→regra', () => {
    const lowMargin = finding({
      id: 'LOW_MARGIN',
      severity: 'WARNING',
      domain: 'MARGIN',
      confidence: 0.9,
      evidence: [
        {
          kpiId: 'GrossMargin',
          value: { observed: 0.12, target: 0.25 },
          kpiStatus: 'SUPPORTED',
        },
      ],
    })

    const snapshot = runRecommendationEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      findings: [lowMargin],
      derivedKpis: [],
    })

    expect(snapshot.recommendations).toHaveLength(1)
    const rec = snapshot.recommendations[0]!
    expect(rec.recommendationCode).toBe('REVIEW_MARGIN_DRIVERS')
    expect(rec.sourceFindingIds).toEqual(['LOW_MARGIN'])
    expect(rec.kpisUsed.map((k) => k.kpiId)).toContain('GrossMargin')
    expect(rec.ruleId).toBe('REC_REVIEW_MARGIN_DRIVERS')
    expect(rec.ruleVersion).toBe('1.0.0')
    expect(rec.operationalConfidence).toBe(0.9)
    expect(rec.recommendedAction.actionCode).toBe('REVIEW_MARGIN_DRIVERS')
    expect(JSON.stringify(rec)).not.toMatch(/increase_product_price/i)
    expect(() => assertRecommendationDeterminism(rec)).not.toThrow()
  })

  it('ZERO_NET_REVENUE → REVIEW_SALES_ACTIVITY', () => {
    const snapshot = runRecommendationEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      findings: [
        finding({
          id: 'ZERO_NET_REVENUE',
          severity: 'WARNING',
          domain: 'SALES',
          confidence: 0.88,
          evidence: [
            { kpiId: 'NetRevenue', value: 0, kpiStatus: 'SUPPORTED' },
          ],
        }),
      ],
      derivedKpis: [],
    })

    expect(snapshot.recommendations[0]?.recommendationCode).toBe(
      'REVIEW_SALES_ACTIVITY',
    )
    expect(snapshot.recommendations[0]?.sourceFindingIds).toEqual([
      'ZERO_NET_REVENUE',
    ])
  })

  it('LOW_INVENTORY_TURNOVER → REVIEW_INVENTORY_CAPITAL', () => {
    const snapshot = runRecommendationEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      findings: [
        finding({
          id: 'LOW_INVENTORY_TURNOVER',
          severity: 'WARNING',
          domain: 'STOCK',
          confidence: 0.8,
          evidence: [
            {
              kpiId: 'InventoryTurnover',
              value: { observed: 0.4, threshold: 1 },
              kpiStatus: 'SUPPORTED',
            },
          ],
        }),
      ],
      derivedKpis: [],
    })

    expect(snapshot.recommendations[0]?.recommendationCode).toBe(
      'REVIEW_INVENTORY_CAPITAL',
    )
  })

  it('INFO finding não gera recommendation operacional', () => {
    const snapshot = runRecommendationEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      findings: [
        finding({
          id: 'INVENTORY_CAPITAL_OBSERVED',
          severity: 'INFO',
          domain: 'STOCK',
          confidence: 1,
          evidence: [
            { kpiId: 'InventoryCapital', value: 1000, kpiStatus: 'SUPPORTED' },
          ],
        }),
      ],
      derivedKpis: [],
    })
    expect(snapshot.recommendations).toEqual([])
  })

  it('confidence abaixo da policy é SKIP_POLICY', () => {
    const snapshot = runRecommendationEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      findings: [
        finding({
          id: 'LOW_MARGIN',
          severity: 'WARNING',
          domain: 'MARGIN',
          confidence: 0.3,
        }),
      ],
      derivedKpis: [],
    })
    expect(snapshot.recommendations).toEqual([])
    expect(snapshot.skippedByPolicy).toBe(1)
  })

  it('determinism gate rejeita recommendation sem Finding', () => {
    const broken = buildRecommendationFromFinding({
      finding: finding({
        id: 'LOW_MARGIN',
        severity: 'WARNING',
        domain: 'MARGIN',
        confidence: 0.9,
      }),
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      ruleId: 'REC_REVIEW_MARGIN_DRIVERS',
      ruleVersion: '1.0.0',
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      action: { actionCode: 'REVIEW_MARGIN_DRIVERS' },
      causeCodes: ['x'],
    })
    const noFinding: Recommendation = { ...broken, sourceFindingIds: [] }
    expect(() => assertRecommendationDeterminism(noFinding)).toThrow(
      /INTEL_REC_NO_FINDING/,
    )
  })

  it('policy bloqueia action codes operacionais', () => {
    expect(isForbiddenOperationalAction('increase_product_price')).toBe(true)
    expect(FORBIDDEN_OPERATIONAL_ACTION_CODES.length).toBeGreaterThan(0)

    const broken = buildRecommendationFromFinding({
      finding: finding({
        id: 'LOW_MARGIN',
        severity: 'WARNING',
        domain: 'MARGIN',
        confidence: 0.9,
      }),
      recommendationCode: 'increase_product_price',
      ruleId: 'BAD',
      ruleVersion: '1.0.0',
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      action: { actionCode: 'increase_product_price' },
      causeCodes: ['x'],
    })
    expect(() => assertRecommendationDeterminism(broken)).toThrow(
      /INTEL_REC_FORBIDDEN/,
    )
  })

  it('port async createRecommendationEngine expõe as mesmas options', async () => {
    const engine = createRecommendationEngine()
    const recs = await engine.evaluate({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      facts: [],
      findings: [
        finding({
          id: 'LOW_MARGIN',
          severity: 'CRITICAL',
          domain: 'MARGIN',
          confidence: 0.95,
        }),
      ],
    })
    expect(recs).toHaveLength(1)
    expect(recs[0]?.sourceFindingIds).toContain('LOW_MARGIN')
  })
})
