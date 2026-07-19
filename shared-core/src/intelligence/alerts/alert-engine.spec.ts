import { describe, expect, it } from 'vitest'
import type { Recommendation } from '../contracts/recommendation'
import type { Alert } from '../contracts/alert'
import {
  assertAlertDeterminism,
  buildAlertFromRecommendation,
  computeAlertUrgency,
  listAlertDetectorIds,
  planSeverityFromRecommendation,
  runAlertEngine,
} from './index'

function recommendation(
  partial: Pick<
    Recommendation,
    'id' | 'recommendationCode' | 'urgency' | 'operationalConfidence'
  > &
    Partial<Recommendation>,
): Recommendation {
  return {
    category: 'MARGIN',
    problemCode: 'LOW_MARGIN',
    evidences: [
      {
        kind: 'kpi',
        code: 'intel.rec.evidence.LOW_MARGIN.GrossMargin',
        kpiId: 'GrossMargin',
        observed: 0.12,
        confidence: 'MEDIUM',
      },
    ],
    financialImpact: {
      metric: 'unestimated',
      estimate: { amount: 0, currency: 'BRL' },
      horizonDays: 0,
      confidence: 'LOW',
    },
    confidence: 'MEDIUM',
    recommendedAction: { actionCode: partial.recommendationCode },
    justification: {
      causeCodes: ['intel.rec.cause.from_finding.LOW_MARGIN'],
      assumptionCodes: [],
      limitations: ['intel.rec.limitation.decision_support_only'],
    },
    kpisUsed: [{ kpiId: 'GrossMargin', formulaVersion: '1.0.0' }],
    domainsConsulted: ['sales'],
    emittedAt: '2026-07-19T18:00:00.000Z',
    status: 'OPEN',
    sourceFindingIds: ['LOW_MARGIN'],
    ruleId: 'REC_REVIEW_MARGIN_DRIVERS',
    ruleVersion: '1.0.0',
    inputFingerprint: 't',
    ...partial,
  }
}

describe('Alert Engine (Cycle 5)', () => {
  it('registry de detectors está carregado', () => {
    expect(listAlertDetectorIds()).toContain(
      'ALERT_ATTENTION_FROM_RECOMMENDATION',
    )
  })

  it('Recommendation → Alert com sourceRecommendationIds e evidence', () => {
    const rec = recommendation({
      id: 'rec:REVIEW_MARGIN_DRIVERS:LOW_MARGIN',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P1',
      operationalConfidence: 0.9,
    })

    const snapshot = runAlertEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      recommendations: [rec],
    })

    expect(snapshot.alerts).toHaveLength(1)
    const alert = snapshot.alerts[0]!
    expect(alert.sourceRecommendationIds).toEqual([rec.id])
    expect(alert.evidences.length).toBeGreaterThan(0)
    expect(alert.titleCode).toBe('intel.alert.title.review_margin_drivers')
    expect(alert.severityJustificationCode).toBeTruthy()
    expect(alert.detectorId).toBe('ALERT_ATTENTION_FROM_RECOMMENDATION')
    expect(alert.detectorVersion).toBe('1.0.0')
    expect(() => assertAlertDeterminism(alert, [rec])).not.toThrow()
  })

  it('propaga confidence da Recommendation (weakest link)', () => {
    const rec = recommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P0',
      operationalConfidence: 0.55,
    })
    const snapshot = runAlertEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      recommendations: [rec],
    })
    expect(snapshot.alerts[0]?.operationalConfidence).toBe(0.55)
  })

  it('urgency CRITICAL não inflaciona confidence baixa', () => {
    const rec = recommendation({
      id: 'rec:weak',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P0',
      operationalConfidence: 0.4,
    })
    const snapshot = runAlertEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      recommendations: [rec],
    })
    const alert = snapshot.alerts[0]!
    expect(alert.severity).toBe('CRITICAL')
    expect(alert.urgency.score).toBe(90)
    expect(alert.operationalConfidence).toBe(0.4)
    expect(alert.operationalConfidence).toBe(rec.operationalConfidence)
  })

  it('cálculo de urgência mapeia tiers P0–P3', () => {
    expect(
      computeAlertUrgency(
        recommendation({
          id: 'a',
          recommendationCode: 'REVIEW_MARGIN_DRIVERS',
          urgency: 'P0',
          operationalConfidence: 1,
        }),
      ).score,
    ).toBe(90)
    expect(
      computeAlertUrgency(
        recommendation({
          id: 'b',
          recommendationCode: 'REVIEW_SALES_ACTIVITY',
          urgency: 'P3',
          operationalConfidence: 1,
        }),
      ).score,
    ).toBe(20)
    expect(
      planSeverityFromRecommendation(
        recommendation({
          id: 'c',
          recommendationCode: 'REVIEW_INVENTORY_CAPITAL',
          urgency: 'P1',
          operationalConfidence: 1,
        }),
      ).severity,
    ).toBe('WARNING')
  })

  it('skip quando Recommendation não tem evidence', () => {
    const rec = recommendation({
      id: 'rec:empty',
      recommendationCode: 'REVIEW_SALES_ACTIVITY',
      urgency: 'P1',
      operationalConfidence: 0.8,
      evidences: [],
    })
    const snapshot = runAlertEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      recommendations: [rec],
    })
    expect(snapshot.alerts).toEqual([])
    expect(snapshot.skipped).toBe(1)
  })

  it('guard rejeita alert sem sourceRecommendationIds', () => {
    const rec = recommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P1',
      operationalConfidence: 0.9,
    })
    const alert = buildAlertFromRecommendation({
      recommendation: rec,
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      contextWindowDays: 30,
      detectorId: 'ALERT_ATTENTION_FROM_RECOMMENDATION',
      detectorVersion: '1.0.0',
    })
    const broken: Alert = { ...alert, sourceRecommendationIds: [] }
    expect(() => assertAlertDeterminism(broken, [rec])).toThrow(
      /INTEL_ALERT_NO_RECOMMENDATION/,
    )
  })

  it('guard rejeita ausência de evidence', () => {
    const rec = recommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P1',
      operationalConfidence: 0.9,
    })
    const alert = buildAlertFromRecommendation({
      recommendation: rec,
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      contextWindowDays: 30,
      detectorId: 'ALERT_ATTENTION_FROM_RECOMMENDATION',
      detectorVersion: '1.0.0',
    })
    const broken: Alert = { ...alert, evidences: [] }
    expect(() => assertAlertDeterminism(broken, [rec])).toThrow(
      /INTEL_ALERT_NO_EVIDENCE/,
    )
  })

  it('guard rejeita inflação de confidence', () => {
    const rec = recommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P0',
      operationalConfidence: 0.4,
    })
    const alert = buildAlertFromRecommendation({
      recommendation: rec,
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      contextWindowDays: 30,
      detectorId: 'ALERT_ATTENTION_FROM_RECOMMENDATION',
      detectorVersion: '1.0.0',
    })
    const inflated: Alert = { ...alert, operationalConfidence: 0.9 }
    expect(() => assertAlertDeterminism(inflated, [rec])).toThrow(
      /INTEL_ALERT_CONFIDENCE_INFLATED/,
    )
  })

  it('não emite suggestedAction operacional / não muta recommendations', () => {
    const rec = recommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_INVENTORY_CAPITAL',
      urgency: 'P1',
      operationalConfidence: 0.85,
      category: 'INVENTORY',
      problemCode: 'LOW_INVENTORY_TURNOVER',
    })
    const before = structuredClone(rec)
    const snapshot = runAlertEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      recommendations: [rec],
    })
    expect(snapshot.alerts[0]?.suggestedAction).toBeUndefined()
    expect(rec).toEqual(before)
    expect(JSON.stringify(snapshot.alerts)).not.toMatch(
      /increase_product_price|FORCE_PURCHASE/i,
    )
  })

  it('janela de contexto padrão 30 dias', () => {
    const rec = recommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P1',
      operationalConfidence: 0.9,
    })
    const snapshot = runAlertEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      recommendations: [rec],
    })
    const alert = snapshot.alerts[0]!
    expect(alert.window.toIso).toBe('2026-07-19T18:00:00.000Z')
    expect(alert.window.fromIso).toBe('2026-06-19T18:00:00.000Z')
    expect(alert.impact.horizonDays).toBe(30)
  })
})
